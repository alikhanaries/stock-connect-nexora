import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const FinanceRecordSchema = new Schema(
  {
    sellerId: { type: ObjectId, ref: 'Seller', required: true, index: true },
    marketplace: { type: String, trim: true },
    orderId: { type: String, trim: true, index: true },
    itemRef: { type: String, trim: true },
    awb: { type: String, trim: true },
    brand: { type: String, trim: true },
    sku: { type: String, trim: true },
    title: { type: String, trim: true },
    skuStatus: { type: String, trim: true },
    orderDate: { type: Date, default: null },
    deliveredDate: { type: Date, default: null },
    chargeableWeight: { type: Number, default: null },
    itemPrice: { type: Number, default: null },
    totalOrderAmount: { type: Number, default: null },
    totalDeliveredOrdersAmount: { type: Number, default: null },
    orderAmountWithoutVAT: { type: Number, default: null },
    logisticPriceSharedWithCustomer: { type: Number, default: null },
    actualLogisticPrice: { type: Number, default: null },
    logisticsPriceDifference: { type: Number, default: null },
    adminCharges: { type: Number, default: null },
    marketplaceCommissionSharedWithCustomer: { type: Number, default: null },
    actualMarketplaceCommission: { type: Number, default: null },
    marketplaceCommissionDifference: { type: Number, default: null },
    ollTekFee: { type: Number, default: null },
    marketingFee10Percent: { type: Number, default: null },
    totalCostsForBrand: { type: Number, default: null },
    whatCustomerReceivesFromOllTek: { type: Number, default: null },
    importVAT: { type: Number, default: null },
    marketplaceLastMile: { type: Number, default: null },
    actualEndToEndLogisticsCost: { type: Number, default: null },
    ollTekInvestmentExtraProfit: { type: Number, default: null },
  },
  { timestamps: true }
);

FinanceRecordSchema.index({ sellerId: 1, orderId: 1 });
FinanceRecordSchema.index({ sellerId: 1, marketplace: 1 });
FinanceRecordSchema.index({ sellerId: 1, orderDate: -1 });

const FinanceRecord = mongoose.model('FinanceRecord', FinanceRecordSchema);

export default FinanceRecord;
