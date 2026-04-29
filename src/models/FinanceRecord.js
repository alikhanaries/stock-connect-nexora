import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const FinanceRecordSchema = new Schema(
  {
    sellerId: { type: ObjectId, ref: 'Seller', required: true },
    marketplace: { type: String, trim: true },
    orderId: { type: String, trim: true, index: true },
    itemRef: { type: String, trim: true },
    brand: { type: String, trim: true },
    sku: { type: String, trim: true },
    skuStatus: { type: String, trim: true },
    orderDate: { type: Date, default: null },
    deliveredDate: { type: Date, default: null },
    totalDeliveredOrdersAmount: { type: Number, default: null },
    orderAmountWithoutVAT: { type: Number, default: null },
    logisticPrice: { type: Number, default: null },
    adminCharges: { type: Number, default: null },
    marketplaceCommission: { type: Number, default: null },
    ollTekFee: { type: Number, default: null },
    marketingFee: { type: Number, default: null },
    customersEarning: { type: Number, default: null },
    paymentStatus: { type: String, trim: true },
  },
  { timestamps: true }
);

FinanceRecordSchema.index({ sellerId: 1, orderId: 1 });
FinanceRecordSchema.index({ sellerId: 1, marketplace: 1 });
FinanceRecordSchema.index({ sellerId: 1, orderDate: -1 });

const FinanceRecord = mongoose.model('FinanceRecord', FinanceRecordSchema);

export default FinanceRecord;
