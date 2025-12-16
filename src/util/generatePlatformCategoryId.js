import PlatformCategoryCounter from '../models/PlatformCategoryCounter.js';
import PlatformCategory from '../models/PlatformCategory.js';
/**
 * Generate unique marketplace_category_id for a given marketplace
 */
export const generatePlatformCategoryId = async (categoryName, categorySlug, parent, sellerId) => {
  // 1️ Check if this category already exists
  const platformCategoryData = await PlatformCategory.findOne(
    { categoryName, categorySlug, parent, sellerId },
    { _id: 1, platformCategoryId: 1 }
  );

  if (platformCategoryData) {
    return platformCategoryData?.platformCategoryId;
  }

  // 2️ Get next global ID from counter
  const counter = await PlatformCategoryCounter.findOneAndUpdate(
    {}, // single global counter
    { $inc: { seq: 1 } }, // atomic increment
    { new: true, upsert: true } // create if doesn't exist
  );

  return counter.seq;
};
