import mongoose from 'mongoose';
const categoryMappingSchema = new mongoose.Schema(
  {
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
categoryMappingSchema.index({ marketplaceId: 1, platformCategoryId: 1 }, { unique: true });

const CategoryMapping = mongoose.model('CategoryMapping', categoryMappingSchema);

export default CategoryMapping;
