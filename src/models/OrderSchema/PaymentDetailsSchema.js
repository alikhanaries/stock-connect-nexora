import mongoose from 'mongoose';

const PaymentDetailsSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    vatNo: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      trim: true,
      index: true,
    },
    paymentReferenceNo: {
      type: String,
      trim: true,
      index: true,
    },
    currencyCode: {
      type: String,
      required: [true, 'Currency code is required'],
      trim: true,
    },
  },
  { _id: false }
);

export default PaymentDetailsSchema;
