import mongoose from 'mongoose';
const { Schema } = mongoose;

const sellerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Seller name is required.'],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: [true, 'A unique slug is required.'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

const Seller = mongoose.model('Seller', sellerSchema);
export default Seller;
