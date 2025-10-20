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
    merchantOrderNo: {
      type: String,
      index: true,
    },
    channelOrderNo: {
      type: String,
      index: true,
    },
    channelReturnNo: {
      type: String,
      index: true,
    },
    channelId: {
      type: Number,
      index: true,
    },
    placedOn: {
      type: Date,
    },
    acknowledgeDate: {
      type: Date,
    },
    status: {
      type: String,
      index: true,
    },
    platform: {
      type: String,
    },
    totalPrice: {
      type: Number,
      default: 0,
    },
    products: [
      {
        _id: false,
        productSkuCode: {
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
    timestamps: true,
    collection: 'returns',
  }
);

ReturnSchema.index({ status: 1, createdAt: -1 });
const Return = mongoose.model('Return', ReturnSchema);

export default Return;
