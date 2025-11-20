export const processInBatches = async (items, batchSize, callback) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const mappedBatch = await callback(batch);
    if (Array.isArray(mappedBatch)) results.push(...mappedBatch);
    else results.push(mappedBatch);
  }
  return results;
};
