import mongoose from 'mongoose';

const SkuSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    sellerOrderId: {
      type: String,
      required: true,
      default: 'NA',
    },
    channelOrderLineNo: { type: String, trim: true },
    status: {
      type: String,
      trim: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    //  STATUS-WISE QUANTITY BREAKDOWN
    statusBreakdown: {
      confirmed: { type: Number, default: 0, min: 0 },
      shipped: { type: Number, default: 0, min: 0 },
      delivered: { type: Number, default: 0, min: 0 },
      returned: { type: Number, default: 0, min: 0 },
      canceled: { type: Number, default: 0, min: 0 },
      shipmentCreated: { type: Number, default: 0, min: 0 },
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
    documentId: {
      type: String,
      trim: true,
      index: true,
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
