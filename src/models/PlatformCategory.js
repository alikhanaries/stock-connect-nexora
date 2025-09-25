import mongoose from 'mongoose';

const platformCategorySchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    categoryName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    categorySlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    parent: {
      type: String,
      required: true,
      default: 'root',
      trim: true,
      index: true,
    },
    platformCategoryId: {
      type: Number,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    platformCategoryTrail: {
      type: String,
      required: true,
      trim: true,
    },
    isEligible: {
      type: Boolean,
      required: true,
      index: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const PlatformCategory = mongoose.model('PlatformCategory', platformCategorySchema);
export default PlatformCategory;
