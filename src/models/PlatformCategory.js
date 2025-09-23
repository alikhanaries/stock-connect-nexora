import mongoose from 'mongoose';

const { Schema } = mongoose;

const platformCategorySchema = new Schema(
  {
    id: {
      type: Number,
      required: true,
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
      index: true,
    },
    parent: { type: String, ref: 'PlatformCategory', default: 'root' },
    platformCategoryId: {
      type: Number,
      required: true,
      index: true,
    },
    platformCategoryTrail: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  }
);
platformCategorySchema.index({ categorySlug: 1 }, { unique: true });

const PlatformCategory = mongoose.model('PlatformCategory', platformCategorySchema);

export default PlatformCategory;
