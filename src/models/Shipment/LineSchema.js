import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema(
  {
    merchantProductNo: { type: String, required: true, index: true },
    orderLineId: { type: Number, required: true, index: true },
    quantity: { type: Number, required: true },
    lineTotalInclVat: { type: Number, default: 0 },
    hsCode: { type: String, index: true },
  },
  { _id: false }
);

export default lineSchema;
