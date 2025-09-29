import mongoose from 'mongoose';

const ReturnSchema = new mongoose.Schema(
  {
    returnId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    merchantReturnNo: {
      type: String,
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    channelId: {
      type: Number,
      index: true,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
      trim: true,
    },
    totalPrice: {
      type: Number,
    },
    placedOn: {
      // Corresponds to 'Placedon'
      type: Date,
    },
    acknowledgeDate: {
      // Corresponds to 'Acknowledge date'
      type: Date,
    },
    status: {
      type: String,
      index: true,
    },
    platform: {
      // Corresponds to 'Platform'
      type: String,
    },
    products: [
      // Contains product number and quantity
      {
        _id: false, // Don't create an _id for sub-documents
        merchantProductNo: {
          type: String,
        },
        quantity: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
    collection: 'Returns',
  }
);

ReturnSchema.index({ status: 1, createdAt: -1 });
const Return = mongoose.model('Return', ReturnSchema);

export default Return;
