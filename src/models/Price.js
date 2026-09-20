import mongoose from 'mongoose';

const PriceSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productSkuCode: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    noonPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    namshiPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    amazonPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    sixthStreetPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    styliPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    minPrice: {
      type: Number,
    },
    maxPrice: {
      type: Number,
    },
    msrp: {
      type: Number,
    },
    purchasePrice: {
      type: Number,
    },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for performance
PriceSchema.index({ sellerId: 1, productId: 1 });
PriceSchema.index({ sellerId: 1, productSkuCode: 1 }, { unique: true });

const Price = mongoose.model('Price', PriceSchema);
export default Price;
