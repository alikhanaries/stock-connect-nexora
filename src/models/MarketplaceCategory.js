import mongoose from 'mongoose';

const MarketplaceCategorySchema = new mongoose.Schema(
  {
    marketplaceId: {
      type: mongoose.Schema.Types.ObjectId, // ref -> Marketplace._id
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
    marketplaceCategoryTrail: {
      type: String, // "electronics>smart-tvs"
      required: true,
      index: true,
    },
    isEligible: {
      type: Boolean,
      required: true,
      index: true,
      default: true,
    },
  },
  { timestamps: true }
);

// prevent duplicate categories per marketplace
MarketplaceCategorySchema.index({ marketplaceId: 1, marketplaceCategoryId: 1 }, { unique: true });

const MarketplaceCategory = mongoose.model('MarketplaceCategory', MarketplaceCategorySchema);

export default MarketplaceCategory;
