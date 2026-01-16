import mongoose from 'mongoose';

const PriceSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    productSkuCode: {
      type: String,
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
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
PriceSchema.index({ sellerId: 1, productId: 1 }, { unique: true });

const Price = mongoose.model('Price', PriceSchema);
export default Price;
