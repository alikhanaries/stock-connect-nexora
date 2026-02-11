import { convertGoogleSheetUrlToExport } from '../helpers/googleSheetFormaterHandler.js';
import { config } from '#config/config.js';
import { Readable } from 'stream';
import { processAmazonOrderImportStream, sanitizeAmazonOrdersData } from '../helpers/amazonOrder.js';
import Order from '../models/Orders.js';
import OrderLogs from '../models/OrderLogs.js';
import Shipment from '../models/Shipment/Shipment.js';
import { errorLog } from '../middleware/errorLogMiddleware.js';

export const syncAmazonOrders = async (sellerId, locale, userId) => {
  try {
    const url = config.AMAZON_ORDER_SHEET_URL;
    if (!url) {
      return { success: false, message: 'Google sheet url is required' };
    }
    const exportUrl = await convertGoogleSheetUrlToExport(url);

    if (!exportUrl) {
      return { success: false, message: 'Invalid google sheet url' };
    }

    const { success, data } = await getNewAmazonOrders(exportUrl, locale, sellerId);

    if (!success) {
      return { success: false, message: 'unable to fetch data from amazon' };
    }
    if (data.length === 0) {
      return { success: true, message: 'already up to date' };
    }

    const dataSavedInDb = await processAmazonOrders(data, sellerId, userId);

    if (!dataSavedInDb.success) {
      return { success: false, message: dataSavedInDb.message };
    }

    const newUpdateCount = dataSavedInDb?.data?.upsertedCount ? dataSavedInDb?.data?.upsertedCount : 0;

    return { success: true, message: 'Orders synced successfully', data: { newUpdateCount } };
  } catch (error) {
    errorLog(error);
    return { success: false, message: error.message };
  }
};

export async function getNewAmazonOrders(url, locale, sellerId) {
  try {
    console.log('Fetching Google Sheet from URL:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processAmazonOrderImportStream(stream, { locale, sellerId });
  } catch (error) {
    console.error('Error fetching new orders from ChannelEngine:', error.message);
    return { success: false, message: error.message };
  }
}

export const processAmazonOrders = async (orders, sellerId, userId) => {
  try {
    const operations = await sanitizeAmazonOrdersData(orders, sellerId);

    if (operations.length === 0) {
      return { success: true, data: { upsertedCount: 0, modifiedCount: 0 } };
    }

    const result = await Order.bulkWrite(operations);
    const upsertedOrderIds = Object.values(result.upsertedIds || {});
    const upsertedIndexes = Object.keys(result.upsertedIds || {}).map((i) => parseInt(i));

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

    const allOrderIds = orders.map((o) => o.orderId);
    const allProcessedOrders = await Order.find({ orderId: { $in: allOrderIds } })
      .select('_id')
      .lean();
    const allProcessedOrderIds = allProcessedOrders.map((o) => o._id);

    try {
      await createAmazonShipmentsForNewOrders(allProcessedOrderIds, sellerId, userId);
    } catch (shipmentError) {
      console.error('Shipment creation failed:', shipmentError.message);
    }

    return {
      success: true,
      data: {
        ...result,
        insertedOrderIds: upsertedOrderIds,
      },
    };
  } catch (error) {
    console.error('Error in processAmazonOrders:', error.message);
    return { success: false, message: error.message };
  }
};

const createAmazonShipmentsForNewOrders = async (orderIds, sellerId, userId) => {
  if (!orderIds || orderIds.length === 0) return;

  try {
    const ordersNeedingShipments = await Order.find({
      _id: { $in: orderIds },
      status: { $in: ['SHIPPED', 'DELIVERED', 'RETURNED'] },
    }).lean();

    if (ordersNeedingShipments.length === 0) return;

    const existingShipments = await Shipment.find({
      orderId: { $in: ordersNeedingShipments.map((o) => o._id) },
      type: 'FORWARD',
    }).lean();

    const ordersWithShipments = new Set(existingShipments.map((s) => s.orderId.toString()));

    const shipmentsToCreate = [];

    for (const order of ordersNeedingShipments) {
      if (ordersWithShipments.has(order._id.toString())) continue;

      const skuList = order.orderSkuList?.skuList || [];
      if (skuList.length === 0) continue;

      const products = skuList.map((sku) => {
        return {
          merchantProductNo: sku.merchantProductNo,
          orderLineId: sku.id,
          quantity: sku.quantity,
          lineTotalInclVat: sku.lineTotalInclVat || 0,
          hsCode: sku.merchantProductNo,
        };
      });

      const awbNumber = `AMZ-${order.orderId}`;

      const sheetDeliveryDate = skuList[0]?.expectedDeliveryDate;
      const deliveryDate =
        order.status === 'DELIVERED' ? (sheetDeliveryDate ? new Date(sheetDeliveryDate) : new Date()) : null;

      shipmentsToCreate.push({
        orderId: order._id,
        sellerId: sellerId,
        userId: userId,
        status: order.status,
        airWaybillNo: awbNumber,
        merchantOrderNo: order.merchantOrderNo || order.orderId,
        shipmentMethod: 'AMAZON',
        method: 'AMAZON',
        type: 'FORWARD',
        isMerchantCreator: false,
        products,
        pieces: products.reduce((sum, p) => sum + p.quantity, 0),
        submissionDate: order.orderDate || new Date(),
        deliveryDate,
        trackingInfo: [
          {
            statusCode: order.status,
            description: `Order ${order.status.toLowerCase()} via Amazon`,
            createdAt: new Date(),
          },
        ],
      });
    }

    if (shipmentsToCreate.length > 0) {
      await Shipment.insertMany(shipmentsToCreate);
    }

    return shipmentsToCreate;
  } catch (error) {
    console.error('Error creating Amazon shipments:', error.message);
    throw error;
  }
};
