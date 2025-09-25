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
    products: [ 
      {
        _id: false, 
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
    timestamps: true, 
    collection: 'Returns',
  }
);

ReturnSchema.index({ status: 1, createdAt: -1 });
const Return = mongoose.model('Return', ReturnSchema);

export default Return;