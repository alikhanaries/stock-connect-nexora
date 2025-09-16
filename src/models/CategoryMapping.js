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
    marketplaceIdRef: {
      type: Schema.Types.ObjectId,
      ref: 'Marketplace', // reference to Marketplace collection
      required: true,
      index: true,
    },
    marketplaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    marketplaceCategoryId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

const CategoryMapping = mongoose.model('CategoryMapping', CategoryMappingSchema);
export default CategoryMapping;
