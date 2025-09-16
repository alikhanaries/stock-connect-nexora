import CategoryMapping from '../models/CategoryMapping.js';

export const addCategoryService = async (categoryDatas, marketplaceId) => {
  try {
    const operations = categoryDatas.map(({ platformCategoryIdRef, marketplaceIdRef, marketplaceCategoryId }) => ({
      updateOne: {
        filter: { platformCategoryIdRef, marketplaceIdRef, marketplaceCategoryId },
        update: { $set: { platformCategoryIdRef, marketplaceIdRef, marketplaceId, marketplaceCategoryId } },
        upsert: true,
      },
    }));

    const result = await CategoryMapping.bulkWrite(operations, { ordered: false });

    return result; // contains counts of created/updated
  } catch (err) {
    console.error('Error in addCategoryService:', err);
    throw err; // preserve stack trace
  }
};
