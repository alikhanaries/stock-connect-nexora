import mongoose from 'mongoose';

const { Schema } = mongoose;

const SyncSellerHistory = new Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    syncType: {
      type: String,
      enum: ['INVENTORY', 'PRODUCT', 'ORDER', 'PRICE'],
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      default: 'SUCCESS',
    },
    itemsSynced: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);
const SyncHistory = mongoose.model('SyncHistory', SyncSellerHistory);
export default SyncHistory;
