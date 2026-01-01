import mongoose from 'mongoose';
import ReturntatusInfo from './ReturnStatusInfo.js';
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
    orderId: {
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
    products: [
      {
        _id: false,
        productSkuCode: {
          type: String,
        },
        orderLineId: {
          type: Number,
          index: true,
        },
        quantity: {
          type: Number,
          default: 0,
        },
        acceptedQuantity: {
          type: Number,
          default: 0,
        },
        rejectedQuantity: {
          type: Number,
          default: 0,
        },
        price: {
          type: Number,
          default: 0,
        },
      },
    ],
    shipmentId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' }],
    logs: [ReturntatusInfo],
    omniful: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'returns',
  }
);

ReturnSchema.index({ status: 1, createdAt: -1 });
const Return = mongoose.model('Return', ReturnSchema);

export default Return;
