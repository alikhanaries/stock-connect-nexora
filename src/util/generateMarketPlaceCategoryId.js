import MarketPlaceCategoryCounter from '../models/MarketPlaceCategoryCounter.js';
import MarketPlaceCategory from '../models/MarketPlaceCategory.js';

/**
 * Generate unique marketplace_category_id for a given marketplace
 */
export const generateMarketPlaceCategoryId = async (marketPlaceId, categoryName, categorySlug, parent) => {
  const MarketPlaceCategoryData = await MarketPlaceCategory.findOne(
    { categoryName, categorySlug, parent, marketPlaceId },
    { _id: 1, marketPlaceCategoryId: 1 }
  );

  if (MarketPlaceCategoryData) {
    return MarketPlaceCategoryData?.marketPlaceCategoryId;
  }
  const counter = await MarketPlaceCategoryCounter.findOneAndUpdate(
    {},
    { $inc: { seq: 1 } }, // atomic increment
    { new: true, upsert: true } // create if doesn't exist
  );

  return counter.seq;
};
