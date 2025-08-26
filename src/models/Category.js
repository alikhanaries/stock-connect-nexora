import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true }
);

// Case-sensitive unique index for slug
CategorySchema.index({ slug: 1 }, { unique: true, collation: { locale: 'en', strength: 3 } });

const Category = mongoose.model('Category', CategorySchema);

export default Category;
