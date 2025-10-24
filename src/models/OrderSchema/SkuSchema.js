import mongoose from 'mongoose';

const SkuSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
    },
    channelOrderLineNo: { type: String, trim: true },
    status: {
      type: String,
      enum: ['NEW', 'IN_PROGRESS', 'SHIPPED', 'RETURNED', 'CANCELED', 'CLOSED', 'IN_COMBI'],
      default: 'NEW',
      index: true,
    },
    isFulfillmentByMarketplace: { type: Boolean, default: false },
    gtin: {
      type: String,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      index: true,
    },
    stockLocation: {
      id: Number,
      name: { type: String, trim: true },
    },
    unitVat: { type: Number, default: 0 },
    lineTotalInclVat: { type: Number, default: 0 },
    lineVat: { type: Number, default: 0 },
    originalUnitPriceInclVat: { type: Number, default: 0 },
    originalUnitVat: { type: Number, default: 0 },
    originalLineTotalInclVat: { type: Number, default: 0 },
    originalLineVat: { type: Number, default: 0 },
    originalFeeFixed: { type: Number, default: 0 },
    bundleProductMerchantProductNo: { type: String, trim: true },
    bundleOrderLineId: Number,
    jurisCode: { type: String, trim: true },
    jurisName: { type: String, trim: true },
    vatRate: { type: Number, default: 0 },
    unitPriceExclVat: { type: Number, default: 0 },
    lineTotalExclVat: { type: Number, default: 0 },
    originalUnitPriceExclVat: { type: Number, default: 0 },
    originalLineTotalExclVat: { type: Number, default: 0 },
    extraData: [
      {
        key: String,
        value: String,
      },
    ],
    channelProductNo: { type: String, trim: true },
    merchantProductNo: {
      type: String,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    cancellationRequestedQuantity: {
      type: Number,
      default: 0,
    },
    unitPriceInclVat: {
      type: Number,
      required: true,
      default: 0,
    },
    feeFixed: { type: Number, default: 0 },
    feeRate: { type: Number, default: 0 },
    condition: {
      type: String,
      enum: ['NEW', 'USED', 'REFURBISHED', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    exactDeliveryDate: Date,
    expectedDeliveryDate: Date,
    latestDeliveryDate: Date,
    exactShipmentDate: Date,
    expectedShipmentDate: Date,
    latestShipmentDate: Date,
    airWaybillNo: { type: String, index: true },
  },
  { _id: false }
);

export default SkuSchema;
