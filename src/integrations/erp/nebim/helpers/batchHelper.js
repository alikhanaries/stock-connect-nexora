export const processInBatches = async (items, batchSize, callback) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const mappedBatch = await Promise.all(batch.map(callback));
    results.push(...mappedBatch);
  }
  return results;
};
