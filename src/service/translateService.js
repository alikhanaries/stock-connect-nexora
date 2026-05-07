import mongoose from 'mongoose';
import Product from '#models/Product.js';
import { translateBatch, isAlreadyInLang } from '#helpers/gemini.js';

// Fields that read from a different source field but save to themselves.
// e.g. nameAr is translated FROM name and saved TO nameAr.
const SOURCE_FIELD_MAP = {
  nameAr: 'name',
  descriptionAr: 'description',
};

const getSourceField = (field) => SOURCE_FIELD_MAP[field] ?? field;

export const translateProductField = async ({ translate, sellerId }) => {
  const fields = [...new Set(translate.map((t) => t.field))];
  const sourceFields = [...new Set(fields.map(getSourceField))];

  console.log(`[TranslateService] Starting — sellerId: ${sellerId}, fields: ${fields.join(', ')}`);

  // Query using source fields so nameAr queries on name, descriptionAr queries on description
  const products = await Product.find({
    sellerId: new mongoose.Types.ObjectId(sellerId),
    $or: fields.map((f) => ({ [getSourceField(f)]: { $exists: true, $nin: [null, ''] } })),
  })
    .select(['_id', ...sourceFields].join(' '))
    .lean();

  console.log(`[TranslateService] Found ${products.length} products`);
  if (!products.length) return { total: 0, translated: 0, skipped: 0, failed: 0 };

  const tasksByLang = {};
  let skipped = 0;

  for (const product of products) {
    for (const { field, lang } of translate) {
      const sourceField = getSourceField(field);
      const text = product[sourceField];
      if (!text?.trim()) continue;

      // Skip numeric values — no translation needed
      if (/^\d+(\.\d+)?$/.test(text.trim())) continue;

      if (isAlreadyInLang(text, lang)) {
        console.log(
          `[TranslateService] Skipping product ${product._id} field "${field}" (source: "${sourceField}") — already in "${lang}"`
        );
        skipped++;
        continue;
      }

      if (!tasksByLang[lang]) tasksByLang[lang] = [];
      tasksByLang[lang].push({ productId: product._id, field, text });
    }
  }

  const totalTasks = Object.values(tasksByLang).reduce((sum, t) => sum + t.length, 0);
  console.log(`[TranslateService] Tasks: ${totalTasks} to translate, ${skipped} skipped (already in target lang)`);

  if (!totalTasks) return { total: products.length, translated: 0, skipped, failed: 0 };

  const updateMap = {};

  for (const [lang, tasks] of Object.entries(tasksByLang)) {
    console.log(`[TranslateService] Translating ${tasks.length} texts to "${lang}"`);
    let translatedTexts;
    try {
      translatedTexts = await translateBatch(
        tasks.map((t) => t.text),
        lang
      );
    } catch (error) {
      const detail = error.geminiError
        ? `[${error.geminiError.code ?? '?'}] ${error.geminiError.status ?? ''}: ${error.geminiError.message ?? error.message}`
        : error.message;
      console.error(`[TranslateService] Batch failed for lang "${lang}": ${detail}`);
      continue;
    }

    tasks.forEach((task, i) => {
      const translated = translatedTexts[i];
      if (!translated) return;
      const id = task.productId.toString();
      if (!updateMap[id]) updateMap[id] = {};
      updateMap[id][task.field] = translated;
    });
  }

  const bulkOps = Object.entries(updateMap).map(([id, updates]) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      update: { $set: updates },
    },
  }));

  if (bulkOps.length) await Product.bulkWrite(bulkOps);

  console.log(
    `[TranslateService] Done — updated: ${bulkOps.length}, skipped: ${skipped}, failed: ${products.length - bulkOps.length - skipped}`
  );
  return {
    total: products.length,
    translated: bulkOps.length,
    skipped,
    failed: products.length - bulkOps.length - skipped,
  };
};
