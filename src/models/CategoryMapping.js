import mongoose from 'mongoose';
const categoryMappingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    platformCategoryId: {
      type: Number,
      required: true,
    },
    marketplaceId: {
      type: Number,
      required: true,
      index: true,
    },
    marketplaceCategoryId: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// enforce uniqueness (marketplace + platformCategoryId)
categoryMappingSchema.index({ sellerId: 1, marketplaceId: 1, platformCategoryId: 1 }, { unique: true });

const CategoryMapping = mongoose.model('CategoryMapping', categoryMappingSchema);

export default CategoryMapping;
