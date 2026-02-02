export const calculateUpsertCount = (currentCount, newCount) => {
  return currentCount + (Number(newCount) || 0);
};
