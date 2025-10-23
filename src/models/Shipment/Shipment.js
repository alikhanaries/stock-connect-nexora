import mongoose from 'mongoose';
import LineSchema from './LineSchema.js'; // adjust path as needed
import TrackingInfoSchema from './TrackingInfoSchema.js';
const shipmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'PICKED', 'RETURNED', 'RETURN REQUESTED', 'DAMAGED', 'CANCELLED', 'DELIVERED'],
      default: 'PENDING',
      index: true,
    },
    trackingInfo: { type: [TrackingInfoSchema], default: [] }, // embed TrackingInfoSchema
    submissionDate: { type: Date, index: true },
    pickupDate: { type: Date, index: true },
    deliveryDate: { type: Date, index: true },

    // Delivery & collection references
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAdress', required: true },
    pickUpId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupAddress', required: true },

    // ChannelEngine / Shipment info
    merchantShipmentNo: { type: String, index: true },
    merchantOrderNo: { type: String, index: true },
    airWaybillNo: { type: String, required: true, index: true },
    shippedFromCountryCode: { type: String, index: true },
    shippedFromStockLocationId: { type: Number, default: 0 },
    method: { type: String, index: true },
    isMerchantCreator: { type: Boolean, default: true },

    // products array
    products: [LineSchema],
    pieces: { type: Number, default: 0 },
    // Extra data for API responses (optional)
    extraData: {
      aymakan: { type: mongoose.Schema.Types.Mixed },
      channelEngine: { type: mongoose.Schema.Types.Mixed },
    },
    shipmentMerchantDetails: {
      name: { type: String, index: true },
      email: {
        type: String,
        lowercase: true,
        trim: true,
        validate: {
          validator: function (v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
          },
          message: (props) => `${props.value} is not a valid email address!`,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
