import mongoose from 'mongoose';
import OrderStatusInfo from './OrderSchema/OrderStatusInfo.js';
const OrderLogsSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  details: [OrderStatusInfo],
});

const OrderLogs = mongoose.model('orderLogs', OrderLogsSchema);
export default OrderLogs;
