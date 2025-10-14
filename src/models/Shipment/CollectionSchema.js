import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    description: { type: String, trim: true },
    country: { type: String, required: true },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Example of compound index: name + city must be unique together
collectionSchema.index({ name: 1 }, { unique: true });

const Collection = mongoose.model('Collection', collectionSchema);
export default Collection;
