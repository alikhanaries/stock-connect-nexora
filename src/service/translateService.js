import mongoose from 'mongoose';
import Product from '#models/Product.js';
import {
  translateBatch,
  isAlreadyInLang,
  initProgress,
  startOperation,
  addProgress,
  finishOperation,
  failOperation,
  finishProgress,
  setOperationRetry,
} from '#helpers/gemini.js';
import { SOURCE_FIELD_MAP } from '#constants/translate.js';

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

  // Group tasks per {field, lang} operation so progress can be tracked individually
  const tasksByOperation = {};
  let skipped = 0;
  let failedTasks = 0;

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

      const opKey = `${field}:${lang}`;
      if (!tasksByOperation[opKey]) tasksByOperation[opKey] = { field, lang, tasks: [] };
      tasksByOperation[opKey].tasks.push({ productId: product._id, text });
    }
  }

  const operations = Object.values(tasksByOperation);
  const totalTasks = operations.reduce((sum, op) => sum + op.tasks.length, 0);
  console.log(`[TranslateService] Tasks: ${totalTasks} to translate, ${skipped} skipped (already in target lang)`);

  if (!totalTasks) {
    initProgress(sellerId, []);
    finishProgress(sellerId);
    return { total: products.length, translated: 0, skipped, failed: 0 };
  }

  initProgress(
    sellerId,
    operations.map(({ field, lang, tasks }) => ({ field, lang, total: tasks.length }))
  );

  const updateMap = {};

  for (const { field, lang, tasks } of operations) {
    console.log(`[TranslateService] Translating ${tasks.length} texts — field: "${field}", lang: "${lang}"`);
    startOperation(sellerId, field, lang);
    let translatedTexts;
    try {
      translatedTexts = await translateBatch(
        tasks.map((t) => t.text),
        lang,
        (count) => addProgress(sellerId, field, lang, count),
        (retryInfo) => setOperationRetry(sellerId, field, lang, retryInfo)
      );
      finishOperation(sellerId, field, lang);
    } catch (error) {
      const detail = (error.geminiError?.message ?? error.message ?? 'Unknown error').split('\n')[0].trim();
      console.error(`[TranslateService] Batch failed — field: "${field}", lang: "${lang}": ${detail}`);
      failOperation(sellerId, field, lang, error);
      failedTasks += tasks.length;
      continue;
    }

    tasks.forEach((task, i) => {
      const translated = translatedTexts[i];
      if (!translated) return;
      const id = task.productId.toString();
      if (!updateMap[id]) updateMap[id] = {};
      updateMap[id][field] = translated;
    });
  }

  const bulkOps = Object.entries(updateMap).map(([id, updates]) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      update: { $set: updates },
    },
  }));

  if (bulkOps.length) await Product.bulkWrite(bulkOps);

  console.log(`[TranslateService] Done — updated: ${bulkOps.length}, skipped: ${skipped}, failed: ${failedTasks}`);
  const result = {
    total: products.length,
    translated: bulkOps.length,
    skipped,
    failed: failedTasks,
  };

  finishProgress(sellerId);
  return result;
};
