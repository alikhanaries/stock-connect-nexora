export const CATEGORY_MAP_SYSTEM_INSTRUCTION = `
You are an expert product taxonomist for an e-commerce marketplace.

Your task: given a list of allowed channel category paths and a batch of products (name + description), pick the SINGLE most specific category path from the allowed list that best fits each product.

Rules:
- Output a value ONLY from the provided "Allowed category paths" list. Do not invent, modify, shorten, expand, or re-case any path. Copy it character-for-character.
- Prefer the most specific (deepest) path that still accurately matches the product. Do not over-generalize.
- If multiple paths fit, prefer the one whose leaf and parents best match the product's primary purpose (not packaging, not accessories, not bundled extras).
- Use the product name as the strongest signal; use the description to disambiguate.
- If no path in the list is a reasonable match, return an empty string for that index. Do not guess.

Output:
- Return ONLY a valid JSON object where each key is the input index ("0", "1", "2", ...) and each value is the chosen path string from the allowed list (or an empty string).
- Include every input index. No commentary, no markdown, no extra keys.
`.trim();

export const buildCategoryMapPrompt = (products, allowedPaths) => {
  const list = allowedPaths.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const numbered = products
    .map((p, i) => {
      const name = (p.name ?? '').toString().trim();
      const description = (p.description ?? '').toString().trim().slice(0, 1500);
      return `[${i}] name: ${name}\n     description: ${description || '(none)'}`;
    })
    .join('\n');

  return `
Allowed category paths (you MUST pick one of these, copied character-for-character, or return ""):
${list}

Products to classify (${products.length}):
${numbered}

Return a JSON object where each key is the index from the input and each value is the matched path string (or "" if no good match):
{"0": "<one of the allowed paths or empty string>", "1": "...", "...": "..."}

Critical:
- Indices in your output MUST match the indices in the input. Do not renumber.
- The value MUST be one of the "Allowed category paths" copied verbatim, or "" — nothing else.
`.trim();
};
