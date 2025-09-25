import mongoose from 'mongoose';

const MarketPlaceCategorySchema = new mongoose.Schema(
  {
    marketPlaceId: {
      type: Number, // 101
      ref: 'Marketplace',
      required: true,
      index: true,
    },
    marketplaceCategoryId: {
      type: Number, // 101
      required: true,
      index: true,
    },
    categoryName: {
      type: String, // "Smart TVs"
      required: true,
    },
    categorySlug: {
      type: String, // "smart-tvs"
      required: true,
      index: true,
    },
    parent: {
      type: String, // "electronics"
      default: 'root',
      index: true,
    },
    categoryTrail: {
      type: String, // "electronics>smart-tvs"
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// prevent duplicate categories per marketplace
MarketPlaceCategorySchema.index({ marketplaceId: 1, marketplaceCategoryId: 1 }, { unique: true });

const MarketplaceCategory = mongoose.model('MarketplaceCategory', MarketPlaceCategorySchema);

export default MarketplaceCategory;
