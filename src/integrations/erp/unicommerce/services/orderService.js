import Order from '#root/src/models/Orders.js';
import { mapOrderStatus } from '../helpers/mapOrderStatus.js';
import { ObjectId } from 'mongodb';
import mapOrderToUniware from '../helpers/mapOrderToUniware.js';
import { normalizeUniwareDate } from '../utils/normalizeUniwareDate.js';
import { config } from '#root/src/config/config.js';
import { randomBytes } from 'node:crypto';
import { BLOCKED_STATUSES, ORDER_STATUS_MAP } from '#root/src/constants/common.js';
import Shipment from '#root/src/models/Shipment/Shipment.js';
import OrderLogs from '#root/src/models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#root/src/helpers/channelEngineErrorMessage.js';
import { channelEnginePush } from '#service/channelEngineClient.js';
import { CE_QUEUE_OPERATIONS } from '#constants/channelEngineQueue.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

export const fetchOrderStatus = async (sellerId, pageNumber, pageSize, orderIds) => {
  try {
    const page = Math.max(Number(pageNumber) || 1, 1);
    const limit = Number(pageSize) || 5;
    const skip = (page - 1) * limit;
    const normalizedOrderId =
      typeof orderIds === 'string' ? orderIds.trim() : orderIds != null ? String(orderIds).trim() : null;
    const query = {
      sellerId: new ObjectId(sellerId),
    };
    if (normalizedOrderId) {
      query.orderId = normalizedOrderId;
    }

    const orders = await Order.find(query).skip(skip).limit(limit).lean();

    if (!orders.length) {
      return { orders: [] };
    }

    return {
      orders: orders.map(mapOrderStatus),
    };
  } catch (error) {
    console.error('fetchOrderStatus service error:', error);
    throw error;
  }
};

export const fetchOrders = async (sellerId, query = {}) => {
  try {
    const { pageNumber = 1, pageSize = 50, orderDateFrom, orderDateTo } = query;
    const page = Math.max(parseInt(pageNumber) || 1, 1);
    const limit = parseInt(pageSize) || 50;
    const skip = (page - 1) * limit;

    const filter = {
      sellerId,
      status: 'IN_PROGRESS',
    };

    // date range filter
    if (orderDateFrom || orderDateTo) {
      filter.orderDate = {};

      if (orderDateFrom) {
        filter.orderDate.$gte = normalizeUniwareDate(orderDateFrom);
      }

      if (orderDateTo) {
        filter.orderDate.$lte = normalizeUniwareDate(orderDateTo);
      }
    }
    const orders = await Order.find(filter).sort({ orderDate: 1 }).skip(skip).limit(limit).lean();

    //  map to Uniware format
    const formattedOrders = orders.map(mapOrderToUniware);

    return {
      orders: formattedOrders,
    };
  } catch (err) {
    console.error('fetchOrders service error:', err);
    throw err;
  }
};
export const cancelOrders = async (sellerId, body) => {
  try {
    const { orderId, orderItems } = body;
    const order = await Order.findOne({ orderId });
    if (!order) {
      return {
        status: 'FAILED',
        orderItems: orderItems.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: 'Order not found',
        })),
      };
    }

    // For full cancel, all SKUs must match orderItems length
    const orderSkus = order.orderSkuList.skuList;
    if (orderSkus.length !== orderItems.length) {
      return {
        status: 'FAILED',
        orderItems: orderItems.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: 'Partial cancellations not allowed',
        })),
      };
    }

    // Ensure quantities match
    const quantitiesMatch = orderSkus.every((sku) => {
      const item = orderItems.find((i) => i.orderItemId === sku.id.toString());
      return item && item.quantity === sku.quantity;
    });

    if (!quantitiesMatch) {
      return {
        status: 'FAILED',
        orderItems: orderItems.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: 'Partial cancellations not allowed',
        })),
      };
    }

    // Perform full cancel
    const result = await cancelFullOrder(order._id, order, sellerId, 'Canceled from Uniware');
    if (!result.success) {
      return {
        status: 'FAILED',
        orderItems: orderItems.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: result?.error?.message || 'Cancellation failed',
        })),
      };
    }

    return { status: 'SUCCESS', orderItems: [] };
  } catch (error) {
    console.error('cancelOrders error:', error);
    return { status: 'FAILED', orderItems: [] };
  }
};

export const cancelFullOrder = async (orderId, order, sellerId, reason = 'NA') => {
  try {
    const orderSkus = order.orderSkuList.skuList;

    if (!orderSkus.length) {
      return { success: false, error: { message: 'No SKUs found for this seller', status: 400 } };
    }

    // Prepare ChannelEngine cancellation payload
    const lines = orderSkus
      .map((sku) => ({
        MerchantProductNo: sku.merchantProductNo,
        OrderLineId: sku.id,
        Quantity: sku.quantity - (sku.cancellationRequestedQuantity || 0),
      }))
      .filter((line) => line.Quantity > 0);

    if (!lines.length) {
      return { success: false, error: { message: 'Nothing to cancel', status: 400 } };
    }

    const cancelPayload = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: order.merchantOrderNo,
      Lines: lines,
      Reason: reason,
      ReasonCode: '0',
      IsMerchantCreator: true,
    };

    // Check for shipped or delivered shipments
    const shippedShipments = await Shipment.find({
      orderId,
      sellerId,
      status: { $in: ['SHIPPED', 'DELIVERED'] },
    }).lean();

    if (shippedShipments.length) {
      return {
        success: false,
        error: { message: 'Seller shipment already shipped, cannot cancel', status: 400 },
      };
    }

    // Cancel remaining shipments
    await Shipment.updateMany(
      { orderId, sellerId, status: { $nin: ['CANCELED', 'DELIVERED', 'SHIPPED'] } },
      { $set: { status: 'CANCELED' } }
    );

    // Blocked statuses check
    if (BLOCKED_STATUSES[order.status]) {
      return { success: false, error: { message: BLOCKED_STATUSES[order.status], status: 400 } };
    }

    // Call ChannelEngine
    const res = await channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.ORDER_CANCELLATION,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: cancelPayload,
      sellerId,
    });

    if (!res.ok) {
      const json = res.data || {};
      const customMsg = cancelChanelEngineCustomErrorMessage(
        json?.Message || json?.errorMessage || 'ChannelEngine cancellation failed'
      );
      return { success: false, error: { message: customMsg, status: res.status } };
    }

    // Update order SKUs and order status
    order.orderSkuList.skuList.forEach((sku) => {
      sku.status = ORDER_STATUS_MAP.CANCELED;
      sku.cancellationRequestedQuantity = sku.quantity;
      sku.statusBreakdown = { confirmed: 0, shipped: 0, delivered: 0, returned: 0, canceled: sku.quantity };
    });
    order.status = ORDER_STATUS_MAP.CANCELED;
    await order.save();

    // Log cancellation
    await OrderLogs.updateOne(
      { orderId },
      { $push: { details: { status: 'CANCELED', description: 'Canceled all items', createdAt: new Date() } } },
      { upsert: true }
    );

    return { success: true, data: order.toObject() };
  } catch (error) {
    console.error('cancelFullOrder error:', error);
    return { success: false, error: { message: error.message } };
  }
};

export default {
  fetchOrders,
  fetchOrderStatus,
  cancelOrders,
};
