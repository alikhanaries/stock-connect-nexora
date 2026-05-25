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
  setUpdatedProducts,
} from '#helpers/geminiTranslate.js';
import { SOURCE_FIELD_MAP } from '#constants/translate.js';
import { buildFilter } from '#util/buildFilter.js';
import { buildCondition } from '#helpers/productFilters.js';

const getSourceField = (field) => SOURCE_FIELD_MAP[field] ?? field;

const reportEmptyValues = (sellerId, translate, totalProducts, message) => {
  initProgress(
    sellerId,
    translate.map(({ field, lang }) => ({ field, lang, total: totalProducts })),
    { totalProducts }
  );
  for (const { field, lang } of translate) {
    failOperation(sellerId, field, lang, new Error(message));
  }
  finishProgress(sellerId);
};

export const translateProductField = async ({
  translate,
  sellerId,
  filters = [],
  search,
  productId,
  emptyValuesMessage,
}) => {
  const fields = [...new Set(translate.map((t) => t.field))];
  const sourceFields = [...new Set(fields.map(getSourceField))];

  console.log(`[TranslateService] Starting — sellerId: ${sellerId}, fields: ${fields.join(', ')}`);

  const scopeFilter = buildFilter({ rawFilters: filters, sellerId, search, buildCondition });
  if (productId) scopeFilter._id = new mongoose.Types.ObjectId(productId);

  const totalProducts = await Product.countDocuments(scopeFilter);
  if (!totalProducts) {
    reportEmptyValues(sellerId, translate, 0, emptyValuesMessage);
    return { total: 0, translated: 0, skipped: 0, failed: 0 };
  }

  const sourceOr = { $or: fields.map((f) => ({ [getSourceField(f)]: { $exists: true, $nin: [null, ''] } })) };
  const finalFilter = scopeFilter.$or ? { $and: [scopeFilter, sourceOr] } : { ...scopeFilter, ...sourceOr };

  // Query using source fields so nameAr queries on name, descriptionAr queries on description
  const products = await Product.find(finalFilter)
    .select(['_id', ...sourceFields].join(' '))
    .lean();

  console.log(`[TranslateService] Found ${products.length}/${totalProducts} products with source values`);
  if (!products.length) {
    reportEmptyValues(sellerId, translate, totalProducts, emptyValuesMessage);
    return { total: totalProducts, translated: 0, skipped: 0, failed: 0 };
  }

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

  const totalTasks = Object.values(tasksByOperation).reduce((sum, op) => sum + op.tasks.length, 0);
  console.log(`[TranslateService] Tasks: ${totalTasks} to translate, ${skipped} skipped (already in target lang)`);

  initProgress(
    sellerId,
    translate.map(({ field, lang }) => ({ field, lang, total: totalProducts })),
    { totalProducts }
  );

  const updateMap = {};

  for (const { field, lang } of translate) {
    const tasks = tasksByOperation[`${field}:${lang}`]?.tasks ?? [];

    if (!tasks.length) {
      failOperation(sellerId, field, lang, new Error(emptyValuesMessage));
      continue;
    }

    console.log(`[TranslateService] Translating ${tasks.length} texts — field: "${field}", lang: "${lang}"`);
    startOperation(sellerId, field, lang);

    const persistChunk = async (chunkTexts, startIndex) => {
      const chunkOps = [];
      chunkTexts.forEach((translated, i) => {
        if (!translated) return;
        const task = tasks[startIndex + i];
        if (!task) return;
        const id = task.productId.toString();
        if (!updateMap[id]) updateMap[id] = {};
        updateMap[id][field] = translated;
        chunkOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(task.productId) },
            update: { $set: { [field]: translated } },
          },
        });
      });
      if (chunkOps.length) await Product.bulkWrite(chunkOps);
      setUpdatedProducts(sellerId, Object.keys(updateMap).length);
    };

    try {
      await translateBatch(
        tasks.map((t) => t.text),
        lang,
        (count) => addProgress(sellerId, field, lang, count),
        (retryInfo) => setOperationRetry(sellerId, field, lang, retryInfo),
        persistChunk
      );
      finishOperation(sellerId, field, lang);
    } catch (error) {
      const detail = (error.geminiError?.message ?? error.message ?? 'Unknown error').split('\n')[0].trim();
      console.error(`[TranslateService] Batch failed — field: "${field}", lang: "${lang}": ${detail}`);
      failOperation(sellerId, field, lang, error);
      failedTasks += tasks.length;
      continue;
    }
  }

  const updatedCount = Object.keys(updateMap).length;
  setUpdatedProducts(sellerId, updatedCount);

  console.log(`[TranslateService] Done — updated: ${updatedCount}, skipped: ${skipped}, failed: ${failedTasks}`);
  const result = {
    total: totalProducts,
    translated: updatedCount,
    skipped,
    failed: failedTasks,
  };

  finishProgress(sellerId);
  return result;
};
