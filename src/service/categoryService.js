import fs from 'fs';
import csv from 'csv-parser'; // for reading CSV
import PlatformCategory from '../models/PlatformCategory.js';
import { mapRowToPlatFormCategory } from '#util/mapRowToPlatFormCategory.js'; // your helper

/* CSV File Import */

export const processPlatformImportStream = async (stream, { filePath } = {}) => {
  const batchSize = process.env.BATCH_SIZE || 500;
  let batch = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let invalidRowsCount = 0;
  let errorRows = [];
  const batchPromises = [];

  // instead of .on("data"), use for-await (handles async mapping)
  const parser = stream.pipe(csv({ headers: ['categoryPath'], skipLines: 0 }));
  let rowIndex = 0;

  for await (const row of parser) {
    rowIndex++;
    try {
      const categories = await mapRowToPlatFormCategory(row, rowIndex);

      if (!categories.length) {
        invalidRowsCount++;
        errorRows.push(rowIndex);
        continue;
      }

      // push all categories from this row
      batch.push(...categories);

      if (batch.length >= batchSize) {
        const toProcess = [...batch];
        batch = [];

        const ops = toProcess.map((c) => ({
          updateOne: {
            filter: {
              categorySlug: c.categorySlug,
              parent: c.parent || null,
            },
            update: { $set: c },
            upsert: true,
          },
        }));

        batchPromises.push(
          PlatformCategory.bulkWrite(ops, { ordered: false })
            .then((res) => {
              insertedCount += res.upsertedCount || 0;
              updatedCount += res.modifiedCount || 0;
              console.log(`Batch upsert: inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
            })
            .catch((err) => console.error('Batch upsert error:', err.message))
        );
      }
    } catch (err) {
      console.error(`Row ${rowIndex} error:`, err.message);
      invalidRowsCount++;
      errorRows.push(rowIndex);
    }
  }

  // Final leftover batch
  if (batch.length) {
    const ops = batch.map((c) => ({
      updateOne: {
        filter: {
          categorySlug: c.categorySlug,
          parent: c.parent || null,
        },
        update: { $set: c },
        upsert: true,
      },
    }));

    batchPromises.push(
      PlatformCategory.bulkWrite(ops, { ordered: false })
        .then((res) => {
          insertedCount += res.upsertedCount || 0;
          updatedCount += res.modifiedCount || 0;
          console.log(`Final upsert: inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
        })
        .catch((err) => console.error('Final batch upsert error:', err.message))
    );
  }

  await Promise.all(batchPromises);

  if (filePath) {
    fs.unlinkSync(filePath);
  }

  return {
    success: true,
    message: `Imported ${insertedCount} new categories, updated ${updatedCount}, skipped ${invalidRowsCount} invalid rows`,
    insertedCount,
    updatedCount,
    invalidRowsCount,
    errorRows,
  };
};

/* CSV File Import */
export const importPlatformCategories = async (filePath) => {
  try {
    const stream = fs.createReadStream(filePath);

    return await processPlatformImportStream(stream, { deleteAfter: true, filePath });
  } catch (err) {
    console.error('Error in importProductsFromCsvFile:', err);
    throw new Error(err.message); // force the catch block
  }
};
