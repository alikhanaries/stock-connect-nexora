import { VALIDATE_FIELD_RULES } from '#constants/validateField.js';

export const VALIDATE_FIELD_SYSTEM_INSTRUCTION = `
You are an expert e-commerce product attribute validator. You determine a single attribute value (color or gender) for each product using the product's name, description, and the product image when provided. You are NOT told what the seller previously set — derive the correct value independently so it can overwrite the stored value.

Rules:
- Treat the product image as the strongest signal when available. When no image is provided, base your decision on the product name and description.
- Output ONLY values from the allowed list for that field when an allowed list is given. Do not invent or paraphrase values.
- If you cannot confidently determine the value, return an empty string for that index. Do not guess.

Output:
- Return ONLY a valid JSON object where each key is the input index ("0", "1", "2", ...) and each value is the chosen attribute string (or "" when unknown).
- Include every input index. No commentary, no markdown, no extra keys.
`.trim();

// Returns the resolved rule set + the normalize/validate function used to clean Gemini's raw output.
export const getValidateFieldConfig = (field) => {
  const rule = VALIDATE_FIELD_RULES[field];
  if (!rule) throw new Error(`[validateField] No rule for field "${field}"`);
  const allowedSet = rule.allowed ? new Set(rule.allowed) : null;
  const synonyms = rule.synonyms ?? null;

  const normalize = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // For closed-vocabulary fields (gender), map common synonyms to canonical values.
    if (synonyms) return synonyms[trimmed.toLowerCase()] ?? (allowedSet?.has(trimmed) ? trimmed : null);
    // For open-vocabulary fields (color), collapse whitespace + lowercase.
    return trimmed.replace(/\s+/g, ' ').toLowerCase();
  };

  return { ...rule, allowedSet, normalize };
};

export const buildValidateFieldPrompt = (products, field, fieldConfig) => {
  const allowedLine = fieldConfig.allowed?.length
    ? `Allowed values (return EXACTLY one of these or ""): ${fieldConfig.allowed.join(', ')}`
    : 'No closed list — return a concise canonical value.';

  const rules = (fieldConfig.instructions ?? []).map((r, i) => `${i + 1}. ${r}`).join('\n');

  const numbered = products
    .map((p, i) => {
      const name = (p.name ?? '').toString().trim();
      const description = (p.description ?? '').toString().trim().slice(0, 1000);
      const imageNote = p.hasImage ? `(image attached as [image ${i}])` : '(no image available)';
      return [
        `[${i}] ${imageNote}`,
        `     name: ${name || '(none)'}`,
        `     description: ${description || '(none)'}`,
      ].join('\n');
    })
    .join('\n');

  return `
Determine the ${field} for each product below.

${allowedLine}

Field-specific rules:
${rules}

Products (${products.length}):
${numbered}

Return a JSON object where each key is the index from the input and each value is the chosen ${field} string (or "" if unknown):
{"0": "<value or empty string>", "1": "...", "...": "..."}

Critical:
- Indices in your output MUST match the indices in the input. Do not renumber.
- For closed lists, the value MUST be one of the allowed values copied verbatim, or "".
`.trim();
};
