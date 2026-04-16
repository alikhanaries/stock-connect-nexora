import mongoose from 'mongoose';

const InventoryStatusSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    productSkuCode: {
      type: String,
      required: true,
      trim: true,
    },
    channelId: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'removed'],
      default: null,
    },
    isFrozen: {
      type: Boolean,
      default: null,
    },
    updatedAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: 'inventorySkuStatus',
    timestamps: false,
    versionKey: false,
  }
);

InventoryStatusSchema.index({ sellerId: 1, productSkuCode: 1, channelId: 1 }, { unique: true });

export default mongoose.model('InventoryStatus', InventoryStatusSchema);
