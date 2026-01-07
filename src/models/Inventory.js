import mongoose from 'mongoose';

const InventorySchema = new mongoose.Schema(
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
    productSkuCode: { type: String, trim: true },
    currentStockCount: { type: Number, required: true },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for performance
InventorySchema.index({ productSkuCode: 1 }, { unique: true });
InventorySchema.index({ sellerId: 1, productSkuCode: 1 });
InventorySchema.index({ sellerId: 1, productId: 1 }, { unique: true });

const Inventory = mongoose.model('Inventory', InventorySchema);
export default Inventory;