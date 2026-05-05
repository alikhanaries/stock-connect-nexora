import mongoose from 'mongoose';

const expressWarehouseSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
    },

    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    sellerName: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      index: true,
    },

    source: {
      type: String,
      default: 'express_warehouse',
    },

    lastSyncedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

expressWarehouseSchema.index({ sku: 1, sellerId: 1, orderId: 1 }, { unique: true });

const ExpressWarehouseInventory = mongoose.model('ExpressWarehouseInventory', expressWarehouseSchema);

export default ExpressWarehouseInventory;
