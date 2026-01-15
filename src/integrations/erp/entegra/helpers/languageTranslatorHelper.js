import OpenAI from 'openai';
import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';

const openai = new OpenAI({ apiKey: entegraConfig.OPENAI_API_KEY });

export const translateCategoriesBatch = async (categoryNames = []) => {
  if (!categoryNames.length) return {};

  // Prepare the prompt for OpenAI
  const prompt = `
You are a professional translator.
Translate the following category names from Turkish to English.
Return a JSON object where keys are the original Turkish names and values are the English translations.
Do NOT change the spelling of brand names or proper nouns.

Turkish names: ${JSON.stringify(categoryNames)}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: 'You are a professional translator.' },
      { role: 'user', content: prompt },
    ],
  });

  let text = response.choices[0].message.content.trim();

  // CLEAN MARKDOWN / CODE BLOCKS

  text = text
    .replace(/```json/i, '')
    .replace(/```/g, '')
    .trim();

  // PARSE JSON SAFELY

  try {
    const map = JSON.parse(text);
    return map;
  } catch (err) {
    console.error('Failed to parse translation response:', err, 'Text:', text);
    return {};
  }
};
