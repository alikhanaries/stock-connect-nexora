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
      enum: [
        'SHIPMENT_CREATED',
        'PICKED',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'RETURNED',
        'RETURN REQUESTED',
        'DAMAGED',
        'CANCELED',
        'DELIVERED',
        'NOT_DELIVERED',
        'SHIPMENT_REPROCESSING',
      ],
      default: 'SHIPMENT_CREATED',
      index: true,
    },
    trackingInfo: { type: [TrackingInfoSchema], default: [] }, // embed TrackingInfoSchema
    submissionDate: { type: Date, index: true },
    pickupDate: { type: Date, index: true },
    deliveryDate: { type: Date, index: true },

    // Delivery & collection references
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAdress' },
    pickUpId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickupAddress' },

    // ChannelEngine / Shipment info
    merchantShipmentNo: { type: String, index: true },
    merchantOrderNo: { type: String, index: true },
    airWaybillNo: { type: String, required: true, index: true },
    shippedFromCountryCode: { type: String, index: true },
    shippedFromStockLocationId: { type: Number, default: 0 },
    method: { type: String, index: true },
    isMerchantCreator: { type: Boolean, default: true },
    invoiceDocumentId: { type: String, index: true },
    shipmentMethod: {
      type: String,
      enum: ['AYMAKAN', 'CHANNEL_ENGINE', 'AMAZON', 'MANUAL', 'UNICOMMERCE'],
      index: true,
    },
    description: { type: String },

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
      },
    },
    cancelReason: { type: String },
    type: {
      type: String,
      enum: ['FORWARD', 'REVERSE'],
      default: 'FORWARD',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
