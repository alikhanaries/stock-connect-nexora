import mongoose from 'mongoose';

const omnifulWarehouseInventorySchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    productName: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    hubCode: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      default: 'omniful',
    },
    lastSyncedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

omnifulWarehouseInventorySchema.index({ sku: 1, hubCode: 1 }, { unique: true });

const OmnifulWarehouseInventory = mongoose.model('OmnifulWarehouseInventory', omnifulWarehouseInventorySchema);

export default OmnifulWarehouseInventory;
