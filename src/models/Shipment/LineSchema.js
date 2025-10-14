import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema({
  merchantProductNo: { type: String, required: true, index: true },
  orderLineId: { type: Number, required: true, index: true },
  quantity: { type: Number, required: true },
  extraData: { type: mongoose.Schema.Types.Mixed, default: {} },
  id: { type: Number, required: true },
  status: { type: String, default: 'PENDING' },
  channelProductNo: { type: String },
});

// Compound index: merchantProductNo + orderLineId unique
lineSchema.index({ merchantProductNo: 1, orderLineId: 1 }, { unique: true });

export default lineSchema;
