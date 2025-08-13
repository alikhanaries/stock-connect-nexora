import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, required: true },
    slug: { type: String, unique: true, required: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const Category = mongoose.model('Category', CategorySchema);

export default Category;
