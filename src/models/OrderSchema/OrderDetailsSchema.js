import mongoose from 'mongoose';

const OrderDetailsSchema = new mongoose.Schema(
  {
    merchantComment: {
      type: String,
      trim: true,
    },
    merchantOrderNo: {
      type: String,
      index: true,
    },
    isBusinessOrder: {
      type: Boolean,
      default: false,
    },
    subTotalInclVat: { type: Number, default: 0 },
    subTotalVat: { type: Number, default: 0 },
    shippingCostsInclVat: { type: Number, default: 0 },
    shippingCostsVat: { type: Number, default: 0 },
    totalInclVat: { type: Number, default: 0 },
    totalVat: { type: Number, default: 0 },
    originalSubTotalInclVat: { type: Number, default: 0 },
    originalSubTotalVat: { type: Number, default: 0 },
    originalShippingCostsInclVat: { type: Number, default: 0 },
    originalShippingCostsVat: { type: Number, default: 0 },
    originalTotalInclVat: { type: Number, default: 0 },
    originalTotalVat: { type: Number, default: 0 },
    subTotalExclVat: { type: Number, default: 0 },
    totalExclVat: { type: Number, default: 0 },
    shippingCostsExclVat: { type: Number, default: 0 },
    originalSubTotalExclVat: { type: Number, default: 0 },
    originalShippingCostsExclVat: { type: Number, default: 0 },
    originalTotalExclVat: { type: Number, default: 0 },
    originalSubTotalFee: { type: Number, default: 0 },
    subTotalFee: { type: Number, default: 0 },
    originalOrderFee: { type: Number, default: 0 },
    orderFee: { type: Number, default: 0 },
    originalTotalFee: { type: Number, default: 0 },
    totalFee: { type: Number, default: 0 },
  },
  { _id: false }
);

export default OrderDetailsSchema;
