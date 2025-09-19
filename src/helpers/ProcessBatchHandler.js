import PlatformCategory from '../models/PlatformCategory.js'; // adjust path

/**
 * Process a batch of categories with bulkWrite upsert.
 *
 * @param {Array} batch - Array of category objects
 * @param {Object} counters - { insertedCount, updatedCount, matchedCount } (mutated)
 * @param {string} label - Optional log label
 */
export const processBatch = async (batch, counters, label = 'Batch') => {
  if (!batch.length) return;

  const ops = batch.map((c) => ({
    updateOne: {
      filter: { categorySlug: c.categorySlug, parent: c.parent || null },
      update: { $set: c },
      upsert: true,
    },
  }));

  try {
    const res = await PlatformCategory.bulkWrite(ops, { ordered: false });

    // 🔹 Update counters
    counters.insertedCount += res.upsertedCount || 0;
    counters.updatedCount += res.modifiedCount || 0;
    counters.matchedCount += res.matchedCount || 0;

    console.log(`${label}: matched ${res.matchedCount}, modified ${res.modifiedCount}, inserted ${res.upsertedCount}`);
  } catch (err) {
    console.error(`${label} upsert error:`, err.message);
  }
};
