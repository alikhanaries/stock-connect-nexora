import MarketPlaceCategoryCounter from '../models/MarketPlaceCategoryCounter.js';
import MarketplaceCategory from '../models/MarketplaceCategory.js';
/**
 * Generate unique marketplace_category_id for a given marketplace
 */
export const generateMarketplaceCategoryId = async (marketplaceId, categoryName, categorySlug, parent) => {
  const marketPlaceCategoryData = await MarketplaceCategory.findOne(
    { categoryName, marketplaceId, categorySlug, parent },
    { _id: 1, marketplaceCategoryId: 1 }
  );

  if (marketPlaceCategoryData) {
    return marketPlaceCategoryData?.marketplaceCategoryId;
  }
  const counter = await MarketPlaceCategoryCounter.findOneAndUpdate(
    { marketplaceId },
    { $inc: { seq: 1 } }, // atomic increment
    { new: true, upsert: true } // create if doesn't exist
  );

  return counter.seq;
};
