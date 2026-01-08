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
    shopifyConfig: {
      type: new Schema(
        {
          url: {
            type: String,
            trim: true,
            match: [/^https:\/\/.+\.myshopify\.com$/, 'Invalid Shopify store URL'],
          },
          apiVersion: {
            type: String,
            trim: true,
          },
          accessToken: {
            type: String,
            trim: true,
            select: false, //  hidden by default
          },
        },
        { _id: false }
      ),
      default: undefined, //  prevents empty {}
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
