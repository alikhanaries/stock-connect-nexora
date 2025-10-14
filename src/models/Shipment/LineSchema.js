import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema(
  {
    merchantProductNo: { type: String, required: true, index: true },
    orderLineId: { type: Number, required: true, index: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

// Compound index: merchantProductNo + orderLineId unique
lineSchema.index({ merchantProductNo: 1, orderLineId: 1 }, { unique: true });

export default lineSchema;
