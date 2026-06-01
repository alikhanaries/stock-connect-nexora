import mongoose from 'mongoose';
import OrderStatusInfo from './OrderSchema/OrderStatusInfo.js';
const OrderLogsSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true,
  },
  details: [OrderStatusInfo],
});

// Optional but recommended to avoid duplicates
OrderLogsSchema.index({ orderId: 1, sellerId: 1 }, { unique: true });
const OrderLogs = mongoose.model('orderLogs', OrderLogsSchema);
export default OrderLogs;
