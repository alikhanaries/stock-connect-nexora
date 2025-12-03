import mongoose from 'mongoose';
import { SELLER_TYPE } from '#constants/common.js';
const { Schema } = mongoose;

const sellerSchema = new Schema(
  {
    ocpSlugId: {
      type: String,
      unique: true,
      trim: true,
      index: true,
    },
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
    type: {
      type: String,
      enum: [SELLER_TYPE.BASE, SELLER_TYPE.NORMAL],
      default: SELLER_TYPE.NORMAL,
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

sellerSchema.index(
  { type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: SELLER_TYPE.BASE },
  }
);

sellerSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '_');
  }
  next();
});
const Seller = mongoose.model('Seller', sellerSchema);
export default Seller;
