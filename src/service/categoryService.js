import PlatformCategory from '../models/PlatformCategory.js';
import slugify from 'slugify';
import { generatePlatformCategoryId } from '#utils/generatePlatformCategoryId.js';
import fs from 'fs';
import csv from 'csv-parser'; // for reading CSV
import { mapRowToMarketPlaceCategory } from '#root/src/util/mapRowtoMarketPlaceCategory.js'; // your helper
import { processBatch } from '../helpers/ProcessBatchHandler.js';
import CategoryMapping from '../models/CategoryMapping.js';

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

export const getMarketPlaceCategoryTrailsService = async (platformCategoryId) => {
  try {
    const marketPlaceTrailData = await CategoryMapping.aggregate([
      // 1. Filter early
      { $match: { platformCategoryId } },

      // 2. Lookup marketplace category (fetch only what we need)
      {
        $lookup: {
          from: 'marketplacecategories',
          let: { mcatId: '$marketplaceCategoryId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$marketplaceCategoryId', '$$mcatId'] } } },
            { $project: { categoryName: 1, parentId: 1, marketplaceCategoryId: 1 } },
          ],
          as: 'marketplaceCategory',
        },
      },
      { $unwind: '$marketplaceCategory' },

      // 3. Build category trail with constraints
      {
        $graphLookup: {
          from: 'marketplacecategories',
          startWith: '$marketplaceCategory.parentId',
          connectFromField: 'parentId',
          connectToField: 'marketplaceCategoryId',
          as: 'categoryTrail',
          depthField: 'level',
          maxDepth: 10, // 🚀 prevents infinite loops
          restrictSearchWithMatch: {}, // can add { marketplaceId: "$marketplaceId" } if stored
        },
      },

      // 4. Lookup channel (optimized)
      {
        $lookup: {
          from: 'channels',
          let: { cid: '$marketplaceId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$channelId', '$$cid'] } } },
            { $project: { channelId: 1, channelName: 1 } },
          ],
          as: 'channel',
        },
      },
      { $unwind: '$channel' },

      // 5. Final projection
      {
        $project: {
          _id: 0,
          marketplaceId: 1,
          marketplacename: '$channel.channelName',
          marketplaceCategoryTrails: {
            $reduce: {
              input: {
                $concatArrays: [
                  {
                    $map: {
                      input: { $reverseArray: '$categoryTrail' }, // ✅ ensures root → child order
                      as: 'c',
                      in: '$$c.categoryName',
                    },
                  },
                  ['$marketplaceCategory.categoryName'],
                ],
              },
              initialValue: '',
              in: {
                $cond: [{ $eq: ['$$value', ''] }, '$$this', { $concat: ['$$value', ' > ', '$$this'] }],
              },
            },
          },
        },
      },
    ]);

    console.log('marketPlaceTrailData', marketPlaceTrailData);
    return marketPlaceTrailData;
  } catch (err) {
    console.error('Error in getMarketPlaceCategoryTrailsService:', err);
    throw new Error(err.message);
  }
};
