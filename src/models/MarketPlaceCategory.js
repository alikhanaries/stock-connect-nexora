import mongoose from 'mongoose';
const { Schema } = mongoose;

const MarketplaceCategorySchema = new Schema(
  {
    categoryName: { type: String, required: true, trim: true, lowercase: true },
    parent: { type: String, required: true, ref: 'MarketplaceCategory', default: 'root' },
    marketplaceId: {
      type: Number,
      required: true,
      index: true,
    },
    categoryTrail: { type: String, required: true, trim: true, lowercase: true },
    marketplaceCategoryId: {
      type: Number, // 101
      required: true,
      index: true,
    },
    categorySlug: {
      type: String, // "smart-tvs"
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Avoid duplicates under same parent in same marketplace
//MarketplaceCategorySchema.index({ name: 1, parent: 1, }, { unique: true });

const MarketplaceCategory = mongoose.model('MarketplaceCategory', MarketplaceCategorySchema);
export default MarketplaceCategory;
