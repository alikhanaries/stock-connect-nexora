import mongoose from 'mongoose';
import Product from '#models/Product.js';
import {
  classifyProductsBatch,
  initCategoryMapProgress,
  addCategoryMapProgress,
  setCategoryMapRetry,
  failCategoryMapProgress,
  finishCategoryMapProgress,
  isCategoryMapCancelled,
  isCategoryMapStopped,
  setCategoryMapAbortController,
} from '#helpers/geminiCategoryMap.js';
import { loadChannelCategories, humanizeCategoryPath } from '#utils/channelCategoriesLoader.js';
import { buildFilter } from '#util/buildFilter.js';
import { buildCondition } from '#helpers/productFilters.js';

const SCOPE_BATCH_SIZE = 200;

export const mapCategoryTrail = async ({
  sellerId,
  productId,
  filters = [],
  search,
  resumeMode = false,
  retryMode = false,
}) => {
  const modeLabel = resumeMode ? ' [resume]' : retryMode ? ' [retry]' : '';
  console.log(
    `[CategoryMapService] Starting — sellerId: ${sellerId}${productId ? `, productId: ${productId}` : ''}` +
      `${filters?.length ? `, filters: ${JSON.stringify(filters)}` : ''}${search ? `, search: "${search}"` : ''}${modeLabel}`
  );

  const { paths: allowedPaths, pathSet } = await loadChannelCategories();

  // Reuse the same filter pipeline the translate flow uses so ?filter= query
  // params (e.g. shippingTime:not_empty:, price:not_empty:) and ?search= apply here too.
  const scopeFilter = buildFilter({ rawFilters: filters, sellerId, search, buildCondition });
  if (productId) scopeFilter._id = new mongoose.Types.ObjectId(productId);

  // Only classify products with at least a name. Resume additionally skips
  // already-categorised rows; retry re-classifies everything in scope.
  const baseRequirements = [{ name: { $exists: true, $nin: [null, ''] } }];
  if (resumeMode) {
    baseRequirements.push({
      $or: [{ categoryTrail: { $exists: false } }, { categoryTrail: null }, { categoryTrail: '' }],
    });
  }
  const requirementClause = baseRequirements.length === 1 ? baseRequirements[0] : { $and: baseRequirements };
  const finalFilter = scopeFilter.$or
    ? { $and: [scopeFilter, requirementClause] }
    : { ...scopeFilter, ...requirementClause };

  initCategoryMapProgress(sellerId, 0);
  const remainingCount = await Product.countDocuments(finalFilter);
  if (!remainingCount) {
    if (resumeMode) {
      finishCategoryMapProgress(sellerId);
      return { total: 0, updated: 0, skipped: 0 };
    }
    initCategoryMapProgress(sellerId, 0, { retryMode });
    finishCategoryMapProgress(sellerId);
    return { total: 0, updated: 0, skipped: 0 };
  }

  initCategoryMapProgress(sellerId, remainingCount, { preserveCompleted: resumeMode, retryMode });
  const totalProducts = remainingCount;

  // One AbortController for the whole category-map pass so cancel aborts the
  // in-flight Gemini call immediately instead of waiting for the natural timeout.
  const ac = new AbortController();
  setCategoryMapAbortController(sellerId, ac);

  const cursor = Product.find(finalFilter).select('_id name description').lean().cursor();

  let buffer = [];
  let updatedCount = 0;

  const flushBuffer = async () => {
    if (!buffer.length) return;
    if (isCategoryMapStopped(sellerId)) return;
    const work = buffer;
    buffer = [];

    const persistChunk = async (results, startIndex, chunk) => {
      if (isCategoryMapCancelled(sellerId)) return;
      const ops = [];
      results.forEach((rawPath, i) => {
        const task = chunk[i] ?? work[startIndex + i];
        if (!task) return;
        if (!rawPath) return;
        const display = humanizeCategoryPath(rawPath);
        if (!display) return;
        ops.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(task._id) },
            update: { $set: { categoryTrail: display, updatedAt: new Date() } },
          },
        });
      });
      if (ops.length) {
        const res = await Product.bulkWrite(ops, { ordered: false });
        const modifiedCount = res.modifiedCount ?? ops.length;
        updatedCount += modifiedCount;
        addCategoryMapProgress(sellerId, results.length, modifiedCount);
      } else {
        addCategoryMapProgress(sellerId, results.length, 0);
      }
    };

    try {
      await classifyProductsBatch(
        work,
        allowedPaths,
        pathSet,
        persistChunk,
        (retryInfo) => setCategoryMapRetry(sellerId, retryInfo),
        () => isCategoryMapStopped(sellerId),
        ac.signal
      );
    } catch (error) {
      if (isCategoryMapStopped(sellerId)) return;
      const detail = (error.geminiError?.message ?? error.message ?? 'Unknown error').split('\n')[0].trim();
      console.error(`[CategoryMapService] Batch failed: ${detail}`);
      failCategoryMapProgress(sellerId, error);
      throw error;
    }
  };

  try {
    for await (const doc of cursor) {
      if (isCategoryMapStopped(sellerId)) break;
      buffer.push(doc);
      if (buffer.length >= SCOPE_BATCH_SIZE) {
        await flushBuffer();
        if (isCategoryMapStopped(sellerId)) break;
      }
    }
    if (!isCategoryMapStopped(sellerId)) await flushBuffer();
  } catch (error) {
    try {
      cursor.close?.();
    } catch {
      // ignore cursor close failure; original error is more relevant
    }
    if (isCategoryMapStopped(sellerId)) {
      const verb = isCategoryMapCancelled(sellerId) ? 'Cancelled' : 'Paused';
      console.log(`[CategoryMapService] ${verb} by user`);
      return { total: totalProducts, updated: updatedCount, stopped: verb.toLowerCase() };
    }
    console.error('[CategoryMapService] Aborted due to error:', error.message);
    return { total: totalProducts, updated: updatedCount, error: true };
  }

  // finishCategoryMapProgress preserves the 'cancelled'/'paused' status set by the helper.
  finishCategoryMapProgress(sellerId);
  if (isCategoryMapStopped(sellerId)) {
    const verb = isCategoryMapCancelled(sellerId) ? 'Cancelled' : 'Paused';
    console.log(`[CategoryMapService] ${verb} — updated: ${updatedCount}/${totalProducts}`);
    return { total: totalProducts, updated: updatedCount, stopped: verb.toLowerCase() };
  }
  console.log(`[CategoryMapService] Done — total: ${totalProducts}, updated: ${updatedCount}`);
  return { total: totalProducts, updated: updatedCount };
};
