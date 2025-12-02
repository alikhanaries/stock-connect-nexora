export const processInBatches = async (items, batchSize, callback, concurrency = 6) => {
  const results = [];
  const batches = [];

  // split
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // run with concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map((batch, idx) => {
        const batchNumber = i + idx + 1; // FIX: correct batch #
        console.log(`[Batch ${batchNumber}] Start — Items: ${batch.length}`);
        return callback(batch, batchNumber);
      })
    );

    chunkResults.forEach((res) => {
      if (Array.isArray(res)) results.push(...res);
      else results.push(res);
    });
  }

  return results;
};
