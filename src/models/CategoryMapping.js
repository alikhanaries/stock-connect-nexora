import mongoose from 'mongoose';

const categoryMappingSchema = new mongoose.Schema(
  {
    platformCategoryIdRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformCategory', // reference model
      required: true,
    },
    marketplaceCategoryIdRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketplaceCategory', // reference model
      required: true,
    },
    marketplaceIdRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Marketplace', // reference model
      required: true,
    },
    marketplaceId: {
      type: String, // e.g. "amazon"
      required: true,
      trim: true,
    },
    marketplaceCategoryId: {
      type: String, // e.g. "101"
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('CategoryMapping', categoryMappingSchema);
