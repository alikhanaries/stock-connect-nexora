import CategoryMapping from '../models/CategoryMapping.js';

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
