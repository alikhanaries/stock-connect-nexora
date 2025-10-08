import PlatformCategoryCounter from '../models/PlatformCategoryCounter.js';
import PlatformCategory from '../models/PlatformCategory.js';
/**
 * Generate unique marketplace_category_id for a given marketplace
 */
export const generatePlatformCategoryId = async (categoryName, categorySlug, parent) => {
  const platformCategoryData = await PlatformCategory.findOne(
    { categoryName, categorySlug, parent },
    { _id: 1, platformCategoryId: 1 }
  );

  if (platformCategoryData) {
    return platformCategoryData?.platformCategoryId;
  }
  const counter = await PlatformCategoryCounter.findOneAndUpdate(
    {},
    { $inc: { seq: 1 } }, // atomic increment
    { new: true, upsert: true } // create if doesn't exist
  );

  return counter.seq;
};
