import CategoryMapping from '../models/CategoryMapping.js';
import PlatformCategory from '../models/PlatformCategory.js';
import slugify from 'slugify';
import { generatePlatformCategoryId } from '#utils/generatePlatformCategoryId.js';
import fs from 'fs';
import csv from 'csv-parser'; // for reading CSV
import { mapRowToMarketPlaceCategory } from '#root/src/util/mapRowtoMarketPlaceCategory.js'; // your helper
import { processBatch } from '../helpers/ProcessBatchHandler.js';

export const insertCategoryTrail = async (categoryTrailArray) => {
  try {
    for (const item of categoryTrailArray) {
      const trailParts = item
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean);

      let parent = 'root';
      const trailDocs = [];

      for (const part of trailParts) {
        const categoryName = part.toLowerCase();
        const categorySlug = slugify(categoryName, { lower: true });
        const platformCategoryId = await generatePlatformCategoryId(categoryName, categorySlug, parent);

        trailDocs.push(part);

        const query = {
          categoryName,
          parent: parent || 'root',
          platformCategoryTrail: trailDocs.join(' > '),
          categorySlug,
          platformCategoryId,
          id: platformCategoryId,
        };

        await PlatformCategory.findOneAndUpdate(
          query,
          { $setOnInsert: query }, // only insert if not exists
          { new: true, upsert: true }
        );

        parent = categorySlug;
      }
    }

    return true;
  } catch (err) {
    console.error('insertCategoryTrail error:', err);
    throw err;
  }
};

export const processMarketPlaceImportStream = async (stream, { filePath, marketPlaceId } = {}) => {
  const batchSize = parseInt(process.env.BATCH_SIZE) || 500;
  let batch = [];
  let rowIndex = 0;

  /// Shared counters object (mutated inside processBatch)
  const counters = {
    insertedCount: 0,
    updatedCount: 0,
  };

  let invalidRowsCount = 0;
  let errorRows = [];

  const parser = stream.pipe(csv({ headers: ['categoryPath'], skipLines: 0 }));

  for await (const row of parser) {
    rowIndex++;
    try {
      const categories = await mapRowToMarketPlaceCategory(row, marketPlaceId);

      if (!categories.length) {
        invalidRowsCount++;
        errorRows.push(rowIndex);
        continue;
      }

      batch.push(...categories);

      if (batch.length >= batchSize) {
        await processBatch(batch, counters, `Batch ${Math.ceil(rowIndex / batchSize)}`);
        batch = [];
      }
    } catch (err) {
      console.error(`Row ${rowIndex} error:`, err.message);
      invalidRowsCount++;
      errorRows.push(rowIndex);
    }
  }

  // Final leftover batch
  await processBatch(batch, counters, 'Final batch');

  // Delete temp file
  if (filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      console.error('Failed to delete CSV file:', err.message);
    }
  }

  return {
    success: true,
    message: `Imported ${counters.insertedCount} new categories, updated ${counters.updatedCount}, skipped ${invalidRowsCount} invalid rows`,
    ...counters,
    invalidRowsCount,
    errorRows,
  };
};
/* CSV File Import */
export const importMarketPlaceCategories = async (filePath, marketPlaceId) => {
  try {
    const stream = fs.createReadStream(filePath);

    return await processMarketPlaceImportStream(stream, { filePath, marketPlaceId });
  } catch (err) {
    console.error('Error in importProductsFromCsvFile:', err);
    throw new Error(err.message); // force the catch block
  }
};

export const mapCategoryService = async (categoryDatas, marketplaceId) => {
  try {
    const operations = categoryDatas.map(({ platformCategoryId, marketplaceCategoryId }) => ({
      updateOne: {
        filter: { platformCategoryId, marketplaceId, marketplaceCategoryId },
        update: { $set: { platformCategoryId, marketplaceId, marketplaceCategoryId } },
        upsert: true,
      },
    }));

    const result = await CategoryMapping.bulkWrite(operations, { ordered: false });

    return result; // contains counts of created/updated
  } catch (err) {
    console.error('Error in mapCategoryService:', err);
    throw err; // preserve stack trace
  }
};
