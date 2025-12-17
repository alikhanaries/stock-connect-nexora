import { errorLog } from '#root/src/middleware/errorLogMiddleware.js';
import OrderLogs from '#root/src/models/OrderLogs.js';
import Order from '#root/src/models/Orders.js';
import Seller from '#root/src/models/Seller.js';
// import { ocpConfig } from '../config/config.js';
import { sanitizeOcpOrdersData } from '../helpers/sanitizeOcpOrdersData.js';
import { createERPAdapter } from '../../base/ERPFactory.js';
import Shipment from '#root/src/models/Shipment/Shipment.js';
import { cancelAymakanShipment } from '#root/src/service/aymakanService.js';
import { BLOCKED_STATUSES, ORDER_STATUS_MAP } from '#root/src/constants/common.js';

const adaptor = createERPAdapter('ocp');

export const getSyncedOrdersOcp = async (sellerId) => {
  try {
    const sellerData = await Seller.findOne({ _id: sellerId, isDeleted: false }).lean();
    if (!sellerData) {
      return { success: false, message: 'Seller not found' };
    }

    const ocpBrandSlug = sellerData.ocpSlugId;

    if (!ocpBrandSlug) {
      return { success: false, message: 'This seller is not yet integrated with Ocp' };
    }

    const data = await adaptor.fetchOrders({ ocpBrandSlug: ocpBrandSlug, size: 100 });

    const dataSavedInDb = await processOrders(data?.content, sellerId);

    if (!dataSavedInDb.success) {
      return { success: false, message: dataSavedInDb.message };
    }

    return { success: true, data: dataSavedInDb?.data };
  } catch (error) {
    errorLog(error);
    return { success: false, message: error.message };
  }
};

export const processOrders = async (orders, sellerId) => {
  try {
    if (!Array.isArray(orders) || orders.length === 0) {
      return { success: true, data: { message: 'No orders to sync' } };
    }
    // Prepare bulk operations
    const operations = await sanitizeOcpOrdersData(orders, sellerId);

    // Execute the bulk write
    const result = await Order.bulkWrite(operations);
    // Get only newly created (upserted) orders
    const upsertedOrderIds = Object.values(result.upsertedIds || {});
    const upsertedIndexes = Object.keys(result.upsertedIds || {}).map((i) => parseInt(i));

    // Build log entries for each newly created order
    const orderLogs = upsertedIndexes.map((index, i) => {
      const order = orders[index];
      const orderId = upsertedOrderIds[i];

      const logDetails = [
        {
          status: 'CREATED',
          description: 'Order Placed',
          createdAt: new Date(order?.OrderDate || order?.orderDate || Date.now()),
        },
      ];

      return {
        orderId,
        details: logDetails,
      };
    });

    // Insert logs only for newly created orders
    if (orderLogs.length > 0) {
      await OrderLogs.insertMany(orderLogs);
      console.log('Inserted order logs:', orderLogs.length);
    } else {
      console.log('No new orders created — skipping log insertion');
    }

    return {
      success: true,
      data: {
        ...result,
        insertedOrderIds: upsertedOrderIds,
      },
    };
  } catch (error) {
    console.error('Error in processOrders:', error.message);
    return { success: false, message: error.message };
  }
};

export const cancelFullOrderOcp = async (orderId, order, reason = 'NA') => {
  try {
    const sellerId = order.sellerId;
    const sellerData = await Seller.findOne({ _id: sellerId, isDeleted: false }).lean();
    const ocpBrandSlug = sellerData.ocpSlugId;

    if (!ocpBrandSlug) {
      return { success: false, message: 'This seller is not yet integrated with Ocp' };
    }

    const shipments = await Shipment.find({
      orderId,
      status: { $nin: ['CANCELED', 'PICKED', 'DELIVERED'] },
    }).lean();

    if (shipments.length) {
      await Promise.all(
        shipments.map(async (s) => {
          try {
            await cancelAymakanShipment(s.airWaybillNo);
          } catch (err) {
            console.warn(`Aymakan cancel failed for ${s.airWaybillNo}:`, err.message);
          }
          await Shipment.updateOne({ _id: s._id }, { status: 'CANCELED' });
        })
      );
    } else if (BLOCKED_STATUSES[order.status]) {
      return { success: false, error: { message: BLOCKED_STATUSES[order.status], status: 400 } };
    }
    // CANCEL ORDER IN OCP
    const ocpOrderId = order.orderId;
    const res = await adaptor.cancelFullOrder({ ocpBrandSlug: ocpBrandSlug, ocpOrderId, reason });

    if (!res.success) {
      let cleanMessage = res?.message || 'OCP Order cancellation failed';
      return {
        success: false,
        message: cleanMessage,
        statusCode: res.status,
        data: null,
      };
    }
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          status: ORDER_STATUS_MAP.CANCELED,
          'orderSkuList.skuList.$[].status': ORDER_STATUS_MAP.CANCELED,
        },
      },
      { new: true }
    );
    // ORDER LOG ENTRY
    const logEntry = {
      status: 'CANCELED',
      description: 'Order Canceled',
      createdAt: new Date(),
    };
    await OrderLogs.updateOne({ orderId }, { $push: { details: logEntry } }, { upsert: true });

    return { success: true, data: updatedOrder.toObject() };
  } catch (error) {
    console.error('cancelFullOrder error:', error);
    return { success: false, error: { message: error.message } };
  }
};
