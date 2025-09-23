import mongoose from 'mongoose';

const categoryMappingSchema = new mongoose.Schema(
  {
    platformCategoryId: {
      type: Number, // e.g. "101"
      required: true,
      trim: true,
      index: true,
    },

    marketplaceId: {
      type: Number,
      required: true,
      index: true,
    },
    marketplaceCategoryId: {
      type: Number, // e.g. "101"
      required: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('CategoryMapping', categoryMappingSchema);
