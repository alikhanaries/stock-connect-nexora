import mongoose from 'mongoose';

const { Schema } = mongoose;

const CategoryMappingSchema = new Schema(
  {
    platformCategoryIdRef: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformCategory', // reference to PlatformCategory collection
      required: true,
      index: true,
    },
    marketplaceId: {
      // marketplace id ex: 1 for noon
      type: Number,
      required: true,
      trim: true,
      index: true,
    },
    marketplaceCategoryId: {
      // reference to MarketPlaceCategory collection
      type: Number,
      required: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);
// ✅ Compound unique index to prevent duplicates
CategoryMappingSchema.index({ platformCategoryIdRef: 1, marketplaceId: 1, marketplaceCategoryId: 1 }, { unique: true });
const CategoryMapping = mongoose.model('CategoryMapping', CategoryMappingSchema);
export default CategoryMapping;
