export const processInBatches = async (items, batchSize, callback, concurrency = 3) => {
  const results = [];
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map((b) => callback(b)));
    chunkResults.forEach((res) => {
      if (Array.isArray(res)) results.push(...res);
      else results.push(res);
    });
  }

  return results;
};
