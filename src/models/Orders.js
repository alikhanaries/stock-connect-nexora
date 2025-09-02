import mongoose from 'mongoose';
import OrderDetailsSchema from './OrderSchema/OrderDetailsSchema.js';
import AddressSchema from './OrderSchema/AddressSchema.js';
import SkuSchema from './OrderSchema/SkuSchema.js';

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    channelId: {
      type: Number,
      required: true,
      index: true,
    },
    globalChannelId: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      index: true,
    },
    globalChannelName: {
      type: String,
    },
    channelName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      trim: true,
      index: true,
    },
    orderDate: {
      type: Date,
      required: true,
      index: true,
    },
    orderDetails: OrderDetailsSchema,
    skus: [SkuSchema],
    shippingAddress: AddressSchema,
    billingAddress: AddressSchema,
  },
  { timestamps: true }
);

const Order = mongoose.model('ChannelEngineOrder', OrderSchema);

export default Order;
