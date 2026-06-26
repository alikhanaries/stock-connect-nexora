import mongoose from 'mongoose';
import Product from '#models/Product.js';
import {
  classifyValidateBatch,
  initValidateFieldProgress,
  addValidateFieldProgress,
  setValidateFieldRetry,
  failValidateFieldProgress,
  finishValidateFieldProgress,
  isValidateFieldCancelled,
  isValidateFieldStopped,
  setValidateFieldAbortController,
  getValidateFieldProgress,
} from '#helpers/geminiValidateField.js';
import { getValidateFieldConfig } from '#helpers/geminiPromptBuilders/validateFieldPrompt.js';
import { VALIDATE_SCOPE_BATCH_SIZE } from '#constants/validateField.js';
import { buildFilter } from '#util/buildFilter.js';
import { buildCondition } from '#helpers/productFilters.js';

const pickImageUrl = (doc) =>
  doc.primaryImageUrl?.trim() ||
  doc.imageUrl?.trim() ||
  (Array.isArray(doc.images) ? doc.images.find((u) => typeof u === 'string' && u.trim()) : null) ||
  doc.extraImageUrl1?.trim() ||
  null;

export const validateProductField = async ({
  field,
  sellerId,
  productId,
  filters = [],
  search,
  resumeMode = false,
  retryMode = false,
}) => {
  const modeLabel = resumeMode ? ' [resume]' : retryMode ? ' [retry]' : '';
  console.log(
    `[ValidateFieldService:${field}] Starting — sellerId: ${sellerId}${productId ? `, productId: ${productId}` : ''}` +
      `${filters?.length ? `, filters: ${JSON.stringify(filters)}` : ''}${search ? `, search: "${search}"` : ''}${modeLabel}`
  );

  const fieldConfig = getValidateFieldConfig(field);

  const scopeFilter = buildFilter({ rawFilters: filters, sellerId, search, buildCondition });
  if (productId) scopeFilter._id = new mongoose.Types.ObjectId(productId);

  // No filter on the target field: gender has a schema default and color is often pre-populated,
  // so an existing value is NOT a reliable signal for "already processed".
  const baseRequirement = { name: { $exists: true, $nin: [null, ''] } };
  const finalFilter = scopeFilter.$or
    ? { $and: [scopeFilter, baseRequirement] }
    : { ...scopeFilter, ...baseRequirement };

  // Read priorCompleted BEFORE any init() — resume re-enters with the paused count and we use it as cursor skip.
  const priorCompleted = resumeMode ? (getValidateFieldProgress(sellerId, field)?.completed ?? 0) : 0;
  const totalProducts = await Product.countDocuments(finalFilter);

  if (resumeMode && priorCompleted >= totalProducts) {
    finishValidateFieldProgress(sellerId, field);
    return { total: totalProducts, updated: 0, skipped: 0 };
  }

  if (!totalProducts) {
    initValidateFieldProgress(sellerId, field, 0, { retryMode });
    finishValidateFieldProgress(sellerId, field);
    return { total: 0, updated: 0, skipped: 0 };
  }

  initValidateFieldProgress(sellerId, field, totalProducts, { preserveCompleted: resumeMode, retryMode });

  const ac = new AbortController();
  setValidateFieldAbortController(sellerId, field, ac);

  // _id-sorted so resume's .skip(priorCompleted) lands on the same products processed before the pause.
  const projection = ['_id', 'name', 'description', 'primaryImageUrl', 'imageUrl', 'extraImageUrl1', 'images'];
  const cursor = Product.find(finalFilter)
    .sort({ _id: 1 })
    .skip(priorCompleted)
    .select(projection.join(' '))
    .lean()
    .cursor();

  let buffer = [];
  let updatedCount = 0;

  const flushBuffer = async () => {
    if (!buffer.length) return;
    if (isValidateFieldStopped(sellerId, field)) return;
    const work = buffer.map((doc) => ({
      _id: doc._id,
      name: doc.name,
      description: doc.description,
      imageUrl: pickImageUrl(doc),
    }));
    buffer = [];

    const persistChunk = async (results, startIndex, chunk) => {
      if (isValidateFieldCancelled(sellerId, field)) return;
      const ops = [];
      results.forEach((value, i) => {
        const task = chunk[i] ?? work[startIndex + i];
        if (!task) return;
        if (!value) return;
        ops.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(task._id) },
            update: { $set: { [field]: value, updatedAt: new Date() } },
          },
        });
      });
      if (ops.length) {
        const res = await Product.bulkWrite(ops, { ordered: false });
        const modifiedCount = res.modifiedCount ?? ops.length;
        updatedCount += modifiedCount;
        addValidateFieldProgress(sellerId, field, results.length, modifiedCount);
      } else {
        addValidateFieldProgress(sellerId, field, results.length, 0);
      }
    };

    try {
      await classifyValidateBatch(
        work,
        field,
        fieldConfig,
        persistChunk,
        (retryInfo) => setValidateFieldRetry(sellerId, field, retryInfo),
        () => isValidateFieldStopped(sellerId, field),
        ac.signal
      );
    } catch (error) {
      if (isValidateFieldStopped(sellerId, field)) return;
      const detail = (error.geminiError?.message ?? error.message ?? 'Unknown error').split('\n')[0].trim();
      console.error(`[ValidateFieldService:${field}] Batch failed: ${detail}`);
      failValidateFieldProgress(sellerId, field, error);
      throw error;
    }
  };

  try {
    for await (const doc of cursor) {
      if (isValidateFieldStopped(sellerId, field)) break;
      buffer.push(doc);
      if (buffer.length >= VALIDATE_SCOPE_BATCH_SIZE) {
        await flushBuffer();
        if (isValidateFieldStopped(sellerId, field)) break;
      }
    }
    if (!isValidateFieldStopped(sellerId, field)) await flushBuffer();
  } catch (error) {
    try {
      cursor.close?.();
    } catch {
      /* ignore */
    }
    if (isValidateFieldStopped(sellerId, field)) {
      const verb = isValidateFieldCancelled(sellerId, field) ? 'Cancelled' : 'Paused';
      console.log(`[ValidateFieldService:${field}] ${verb} by user`);
      return { total: totalProducts, updated: updatedCount, stopped: verb.toLowerCase() };
    }
    console.error(`[ValidateFieldService:${field}] Aborted due to error:`, error.message);
    return { total: totalProducts, updated: updatedCount, error: true };
  }

  finishValidateFieldProgress(sellerId, field);
  if (isValidateFieldStopped(sellerId, field)) {
    const verb = isValidateFieldCancelled(sellerId, field) ? 'Cancelled' : 'Paused';
    console.log(`[ValidateFieldService:${field}] ${verb} — updated: ${updatedCount}/${totalProducts}`);
    return { total: totalProducts, updated: updatedCount, stopped: verb.toLowerCase() };
  }
  console.log(`[ValidateFieldService:${field}] Done — total: ${totalProducts}, updated: ${updatedCount}`);
  return { total: totalProducts, updated: updatedCount };
};
