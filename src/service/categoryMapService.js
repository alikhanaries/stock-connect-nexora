import mongoose from 'mongoose';
import Product from '#models/Product.js';
import {
  classifyProductsBatch,
  initCategoryMapProgress,
  addCategoryMapProgress,
  setCategoryMapRetry,
  failCategoryMapProgress,
  finishCategoryMapProgress,
} from '#helpers/geminiCategoryMap.js';
import { loadChannelCategories, humanizeCategoryPath } from '#utils/channelCategoriesLoader.js';
import { buildFilter } from '#util/buildFilter.js';
import { buildCondition } from '#helpers/productFilters.js';

const SCOPE_BATCH_SIZE = 200;

export const mapCategoryTrail = async ({ sellerId, productId, filters = [], search }) => {
  console.log(
    `[CategoryMapService] Starting — sellerId: ${sellerId}${productId ? `, productId: ${productId}` : ''}` +
      `${filters?.length ? `, filters: ${JSON.stringify(filters)}` : ''}${search ? `, search: "${search}"` : ''}`
  );

  const { paths: allowedPaths, pathSet } = await loadChannelCategories();

  // Reuse the same filter pipeline the translate flow uses so ?filter= query
  // params (e.g. shippingTime:not_empty:, price:not_empty:) and ?search= apply here too.
  const scopeFilter = buildFilter({ rawFilters: filters, sellerId, search, buildCondition });
  if (productId) scopeFilter._id = new mongoose.Types.ObjectId(productId);

  // Only classify products with at least a name
  const nameRequirement = { name: { $exists: true, $nin: [null, ''] } };
  const finalFilter = scopeFilter.$or
    ? { $and: [scopeFilter, nameRequirement] }
    : { ...scopeFilter, ...nameRequirement };

  const totalProducts = await Product.countDocuments(finalFilter);
  if (!totalProducts) {
    initCategoryMapProgress(sellerId, 0);
    finishCategoryMapProgress(sellerId);
    return { total: 0, updated: 0, skipped: 0 };
  }

  initCategoryMapProgress(sellerId, totalProducts);

  const cursor = Product.find(finalFilter).select('_id name description').lean().cursor();

  let buffer = [];
  let updatedCount = 0;

  const flushBuffer = async () => {
    if (!buffer.length) return;
    const work = buffer;
    buffer = [];

    const persistChunk = async (results, startIndex, chunk) => {
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
      await classifyProductsBatch(work, allowedPaths, pathSet, persistChunk, (retryInfo) =>
        setCategoryMapRetry(sellerId, retryInfo)
      );
    } catch (error) {
      const detail = (error.geminiError?.message ?? error.message ?? 'Unknown error').split('\n')[0].trim();
      console.error(`[CategoryMapService] Batch failed: ${detail}`);
      failCategoryMapProgress(sellerId, error);
      throw error;
    }
  };

  try {
    for await (const doc of cursor) {
      buffer.push(doc);
      if (buffer.length >= SCOPE_BATCH_SIZE) {
        await flushBuffer();
      }
    }
    await flushBuffer();
  } catch (error) {
    // already marked as error in flushBuffer; just exit
    console.error('[CategoryMapService] Aborted due to error:', error.message);
    return { total: totalProducts, updated: updatedCount, error: true };
  }

  finishCategoryMapProgress(sellerId);
  console.log(`[CategoryMapService] Done — total: ${totalProducts}, updated: ${updatedCount}`);
  return { total: totalProducts, updated: updatedCount };
};
