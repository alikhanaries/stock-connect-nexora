import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { ORDER_STATUS_MAP, SELECTED_FIELDS, BLOCKED_STATUSES } from '#constants/common.js';
import orderhelper from '#helpers/Order.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { randomBytes } from 'node:crypto';
import Shipment from '../models/Shipment/Shipment.js';
import Product from '../models/Product.js';
import { cancelAymakanShipment } from '#service/aymakanService.js';
import { formatShipmentTrackingInfo, syncShipmentStatus } from '#service/shipmentService.js';
import { formatDateTime } from '#root/src/helpers/Common.js';
import OrderLogs from '#models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#helpers/channelEngineErrorMessage.js';
const formatOrder = (order) => {
  const totalQuantity = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const totalPrice = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.lineVat || 0), 0) || 0;
  const customer = `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim();

  return {
    _id: order._id,
    orderID: order.orderId,
    quantity: totalQuantity,
    totalPrice: totalPrice,
    customer,
    placedOn: order.orderDate,
    email: order.orderCustomer?.email,
    phoneNumber: order.orderCustomer?.phone,
    status: order.status,
    platform: order.channelName,
    paymentMethod: order.paymentDetails?.paymentMethod,
    currencyCode: order.paymentDetails?.currencyCode,
  };
};

const getAllOrders = async (query, sellerId) => {
  try {
    const {
      page = 1,
      size = 10,
      search,
      toDate,
      fromDate,
      status,
      sortOrder = 'desc',
      sortBy = 'orderId',
      platform = '',
    } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    const filter = { sellerId: sellerId };

    if (search) {
      const regex = { $regex: search, $options: 'i' };

      filter.$or = [
        { orderId: regex },
        { 'orderSkuList.skuList.description': regex },
        { 'orderCustomer.email': regex },
        { 'orderCustomer.firstName': regex },
        { 'orderCustomer.lastName': regex },
        { 'orderCustomer.phone': regex },
      ];
    }

    if (platform) {
      filter.channelName = { $regex: platform, $options: 'i' };
      appliedFilters.platform = platform;
    }

    if (fromDate || toDate) {
      filter.createdAt = {};

      if (fromDate) {
        filter.createdAt.$gte = new Date(fromDate);
        appliedFilters.fromDate = fromDate;
      }
      if (toDate) {
        filter.createdAt.$lte = new Date(toDate);
        appliedFilters.toDate = toDate;
      }
    }

    if (status) {
      // Convert comma-separated string → array
      const statusArray = status.split(',').map((s) => s.trim().toUpperCase());

      // Validate against enum
      const validStatuses = Object.values(ORDER_STATUS_MAP);
      const invalid = statusArray.filter((s) => !validStatuses.includes(s));

      if (invalid.length > 0) {
        throw new Error(`Invalid status: ${invalid.join(', ')}. Valid statuses are: ${validStatuses.join(', ')}`);
      }

      // Build Mongo filter (case-insensitive)
      filter.status = {
        $in: statusArray.map((s) => new RegExp(`^${s}$`, 'i')),
      };

      appliedFilters.status = status; // or original string if you prefer
    }

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
        .collation({ locale: 'en_US', numericOrdering: true })
        .select(SELECTED_FIELDS)
        .lean(),
    ]);

    return {
      data: orders.map(formatOrder),
      appliedFilters: appliedFilters,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return { success: false, message: err.message };
  }
};

export const getOrderById = async (id) => {
  try {
    // SYNC SHIPMENT & ORDER STATUSAS PER AYMAKAN TRACKING INFO
    await syncShipmentStatus(id);

    //  Fetch the order
    const order = await Order.findById(id).lean();
    if (!order) return false;

    // Fetch all shipments for this order except those with status 'CANCELED'
    const shipments = await Shipment.find({
      orderId: id,
      status: { $ne: 'CANCELED' },
    }).lean();

    //  Track shipped quantities per merchantProductNo
    const shippedMap = {};
    shipments.forEach((shipment) => {
      (shipment.products || []).forEach((product) => {
        const key = product.merchantProductNo;
        shippedMap[key] = (shippedMap[key] || 0) + product.quantity;
      });
    });

    const allOrderSkus = order.orderSkuList?.skuList || [];

    // Gather all merchantProductNos for image lookup
    const allMerchantNos = allOrderSkus.map((sku) => sku.merchantProductNo);

    //  Fetch product images and hsCodeSA in ONE query
    const productsMap = await Product.find(
      { productSkuCode: { $in: allMerchantNos } },
      { productSkuCode: 1, images: 1, hsCodeSA: 1 }
    )
      .lean()
      .then((products) =>
        products.reduce((acc, p) => {
          acc[p.productSkuCode] = {
            image: p.images?.[0] || null,
            hsCode: p.hsCodeSA || p.merchantProductNo,
          };
          return acc;
        }, {})
      );

    //  Build item groups
    const unshippedItems = [];
    const cancelledItems = [];

    allOrderSkus.forEach((product) => {
      const shippedQty = shippedMap[product.merchantProductNo] || 0;

      const notShippedQty = product.quantity - product.cancellationRequestedQuantity - shippedQty;
      const status = product.status?.toUpperCase() || '';

      // Skip cancelled items from unshipped and collect separately
      if (status === 'CANCELED' || status === 'PARTIALLY_CANCELED' || status === 'IN_COMBI') {
        cancelledItems.push({
          id: product?.id,
          merchantProductNo: product.merchantProductNo,
          channelProductNo: product?.channelProductNo,
          name: product?.description,
          imageUrl: productsMap[product.merchantProductNo]?.image || null,
          unitPriceInclVat: product?.unitPriceInclVat,
          unitPriceExclVat: product?.unitPriceExclVat,
          unitVat: product?.unitVat,
          lineTotalInclVat: product?.lineTotalInclVat,
          lineTotalExclVat: product?.lineTotalExclVat,
          lineVat: product?.lineVat,
          quantity:
            status === 'PARTIALLY_CANCELED' || product?.status === 'IN_COMBI'
              ? product?.cancellationRequestedQuantity
              : product.quantity,
          status: product?.status === 'IN_COMBI' ? 'PARTIALLY_CANCELED' : product?.status,
          hsCode: productsMap[product.merchantProductNo]?.hsCode || product.merchantProductNo,
        });
        if (status === 'CANCELED') {
          return; //  Don't include cancelled items in unshipped
        }
      }

      //  Only include non-cancelled unshipped items
      if (notShippedQty > 0) {
        unshippedItems.push({
          id: product?.id,
          merchantProductNo: product.merchantProductNo,
          channelProductNo: product?.channelProductNo,
          name: product?.description,
          imageUrl: productsMap[product.merchantProductNo]?.image || null,
          unitPriceInclVat: product?.unitPriceInclVat,
          unitPriceExclVat: product?.unitPriceExclVat,
          unitVat: product?.unitVat,
          lineTotalInclVat: product?.lineTotalInclVat,
          lineTotalExclVat: product?.lineTotalExclVat,
          lineVat: product?.lineVat,
          quantity: notShippedQty,
          status: product?.status,
          hsCode: productsMap[product.merchantProductNo]?.hsCode || product.merchantProductNo,
        });
      }
    });

    //  Build shipped items
    const shippedItems = shipments.map((shipment) => ({
      shipmentStatus: shipment.status || 'SHIPMENT_CREATED',
      shipmentId: shipment._id,
      trackingNumber: shipment.airWaybillNo || null,
      lineItems:
        (shipment.products || []).map((shipmentSku) => {
          const orderSku = allOrderSkus.find((oSku) => oSku.merchantProductNo === shipmentSku.merchantProductNo);

          return {
            id: orderSku?.id,
            merchantProductNo: shipmentSku.merchantProductNo,
            channelProductNo: orderSku?.channelProductNo,
            name: orderSku?.description,
            imageUrl: productsMap[shipmentSku.merchantProductNo]?.image || null,
            quantity: shipmentSku.quantity,
            unitPriceInclVat: orderSku?.unitPriceInclVat,
            unitPriceExclVat: orderSku?.unitPriceExclVat,
            unitVat: orderSku?.unitVat,
            lineTotalInclVat: orderSku?.lineTotalInclVat,
            lineTotalExclVat: orderSku?.lineTotalExclVat,
            lineVat: orderSku?.lineVat,
            airWaybillNo: shipment.airWaybillNo,
            status: orderSku?.status,
            hsCode: productsMap[shipmentSku.merchantProductNo]?.hsCode || shipmentSku.merchantProductNo,
            trackingInfo: formatShipmentTrackingInfo(shipment?.trackingInfo) || [],
          };
        }) || [],
      shipmentMode: shipment.shipmentMode || 'AYMAKAN',
    }));

    // Fetch main order details
    const filteredData = transformOrderResponse(order);

    // Fetch order logs for this order
    const orderLogsDetails = await OrderLogs.findOne({ orderId: id }).lean();
    // Format the log details safely
    const orderLogsData = orderLogsDetails?.details?.length ? formatOrderTrackingInf(orderLogsDetails.details) : [];

    // Final combined response
    return {
      ...filteredData,
      shippedItems,
      unshippedItems,
      cancelledItems,
      orderLogsData,
    };
  } catch (err) {
    console.log(err);
  }
};
const getOrderStats = async (sellerId) => {
  try {
    const statuses = Object.keys(ORDER_STATUS_MAP);
    const counts = await Promise.all(statuses.map((status) => Order.countDocuments({ status, sellerId: sellerId })));
    const stats = statuses.reduce((acc, status, i) => {
      acc[status] = counts[i];
      return acc;
    }, {});
    return stats;
  } catch (error) {
    console.error('Error getting order stats:', error.message);
  }
};

export const processOrders = async (orders, sellerId) => {
  try {
    // Prepare bulk operations
    const operations = await orderhelper.sanitizeOrdersData(orders, sellerId);

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

export async function getNewOrders() {
  try {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}orders?apiKey=${CHANNEL_ENGINE_API_KEY}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    if (!data?.Content?.length) {
      return { success: false, message: 'No data received from ChannelEngine' };
    }
    return {
      success: true,
      data: data.Content,
    };
  } catch (error) {
    console.error('Error fetching new orders from ChannelEngine:', error.message);
    return { success: false, message: error.message };
  }
}

const getOrderComparison = async (lowercasedPeriod, sellerId) => {
  const { currentPeriodStart, previousPeriodStart, previousPeriodEnd } = orderhelper.getPeriodDate(lowercasedPeriod);

  const [currentCount, previousCount] = await Promise.all([
    Order.countDocuments({ sellerId: sellerId, createdAt: { $gte: currentPeriodStart } }),
    Order.countDocuments({ sellerId: sellerId, createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd } }),
  ]);

  let percentageChange = 0;

  if (previousCount > 0) {
    percentageChange = Math.round(((currentCount - previousCount) / previousCount) * 100);
  } else if (currentCount > 0) {
    percentageChange = 100;
  }

  const response = {
    totalOrders: currentCount - previousCount,
    percentage: percentageChange,
    period: lowercasedPeriod,
  };
  return response;
};

const cancelOrder = async (orderId, reason) => {
  try {
    const existenceOfOrder = await Order.findById(orderId).lean();
    if (!existenceOfOrder) {
      return { success: false, error: { message: 'Order not found', status: 404 } };
    }

    const lines = existenceOfOrder.orderSkuList.skuList.map((oItem) => {
      return {
        MerchantProductNo: oItem.merchantProductNo,
        OrderLineId: oItem.id,
        Quantity: oItem.quantity,
      };
    });

    const info = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: existenceOfOrder.merchantOrderNo,
      Lines: lines,
      Reason: reason,
      ReasonCode: '0',
      IsMerchantCreator: true,
    };

    if (BLOCKED_STATUSES[existenceOfOrder.status]) {
      return { success: false, error: { message: BLOCKED_STATUSES[existenceOfOrder.status], status: 400 } };
    }

    const markingCancelled = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`,
      {
        method: 'POST',
        body: JSON.stringify(info),
      }
    );

    const markingCancelledObject = await markingCancelled.json();

    if (parseInt(markingCancelledObject.StatusCode / 100) === 4) {
      return { success: false, error: markingCancelledObject };
    }

    const updateInformation = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          status: ORDER_STATUS_MAP.CANCELED,
          'orderSkuList.skuList.$[].status': ORDER_STATUS_MAP.MANCO,
        },
      },
      { new: true }
    );

    return { success: true, data: updateInformation.toObject() };
  } catch (error) {
    console.error(error);
    return { success: false, error: error };
  }
};

const acknowledgeOrder = async (orderId, merchantOrderNo) => {
  const url = `${CHANNEL_ENGINE_BASE_URL}orders/acknowledge?apiKey=${CHANNEL_ENGINE_API_KEY}`;

  const payload = {
    MerchantOrderNo: merchantOrderNo,
    OrderId: orderId,
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to acknowledge order: ${errorData.Message || response.statusText}`);
    }
  } catch (error) {
    throw new Error(`Failed to acknowledge order ${orderId}`, error);
  }
};
const backgroundAcknowledgementOrders = async (newOrdersToAcknowledge) => {
  const ackPromises = newOrdersToAcknowledge.map((order) => {
    if (order.ChannelOrderNo && order.Id) {
      const merchantOrderNo = `${order?.ChannelOrderNo}-${order?.Id}`;
      return acknowledgeOrder(order.Id, merchantOrderNo);
    }
  });

  const results = await Promise.allSettled(ackPromises);

  const successfulOrdersToSave = [];

  results.forEach((result, index) => {
    const originalOrder = newOrdersToAcknowledge[index];

    if (result.status === 'fulfilled') {
      successfulOrdersToSave.push({
        ...originalOrder,
        MerchantOrderNo: `${originalOrder.ChannelOrderNo}-${originalOrder.Id}`,
        Status: 'IN_PROGRESS',
      });
    }
  });

  if (successfulOrdersToSave.length > 0) {
    await processOrders(successfulOrdersToSave);
  }
};

const transformOrderResponse = (response) => {
  if (!response) return null;
  const data = response;
  // Payment Info
  const paymentInfo = {
    channelName: data.channelName,
    paymentMethod: data.orderPaymentDetails?.paymentMethod,
    currencyCode: data.orderPaymentDetails?.currencyCode,
  };
  // Customer Info
  const customerInfo = {
    name: `${data.orderCustomer?.firstName || ''} ${data.orderCustomer?.lastName || ''}`.trim(),
    email: data.orderCustomer?.email,
    phoneNo: data.orderCustomer?.phone,
  };
  // Shipping Address
  const shippingAddress = {
    address: [data.orderShippingAddress?.line1, data.orderShippingAddress?.line2, data.orderShippingAddress?.line3]
      .filter(Boolean)
      .join(', '),
    city: data.orderShippingAddress?.city,
    region: data.orderShippingAddress?.region,
    zipCode: data.orderShippingAddress?.zipCode,
  };

  return {
    _id: data?._id,
    merchantOrderNo: data?.merchantOrderNo || '',
    channelId: data?.channelId,
    channelName: data?.channelName,
    orderId: data?.orderId,
    paymentInfo,
    customerInfo,
    shippingAddress,
    status: data.status,
    subtotal: data.totalExclVat,
    tax: data.totalVat,
    total: data.totalInclVat,
    shippingFee: data.shippingCostsInclVat,
  };
};

const cancelFullOrder = async (orderId, reason = 'NA') => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) return { success: false, error: { message: 'Order not found', status: 404 } };

    const lines = order.orderSkuList.skuList
      .map((item) => ({
        MerchantProductNo: item.merchantProductNo,
        OrderLineId: item.id,
        Quantity: Math.max(0, parseInt(item.quantity) - parseInt(item.cancellationRequestedQuantity || 0)),
      }))
      .filter((line) => line.Quantity > 0);

    const cancelPayload = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: order.merchantOrderNo,
      Lines: lines,
      Reason: reason,
      ReasonCode: '0',
      IsMerchantCreator: true,
    };

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
    // CANCEL ORDER IN CHANNEL ENGINE
    const res = await fetch(`${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelPayload),
    });

    if (!res.ok) {
      const json = await res.json();
      let cleanMessage = json?.Message || json?.errorMessage || 'ChannelEngine cancellation failed';
      const customMsg = cancelChanelEngineCustomErrorMessage(cleanMessage);
      return {
        success: false,
        message: customMsg,
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

export const cancelPartialOrder = async (orderId, products, reason) => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) return { success: false, error: { message: 'Order not found', status: 404 } };

    // Collect shipped (DELIVERED) product IDs
    const shippedProducts = new Set(
      order.orderSkuList?.skuList
        ?.filter((sku) => ['DELIVERED', 'PICKED'].includes(sku.status))
        .map((sku) => sku.id.toString())
    );

    // Block cancel if any requested SKU is shipped
    const hasShipped = products.some((p) => shippedProducts.has(p.orderLineId.toString()));
    if (hasShipped) {
      return { success: false, error: { message: 'Cannot cancel delivered order', status: 409 } };
    }

    // Prepare cancel payload for ChannelEngine
    const cancelPayload = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: order.merchantOrderNo,
      Lines: products.map((p) => ({
        MerchantProductNo: p.merchantProductNo,
        OrderLineId: p.orderLineId,
        Quantity: p.quantity,
      })),
      Reason: reason,
      ReasonCode: '0',
      IsMerchantCreator: true,
    };

    // ChannelEngine cancellation function (safe, non-throwing)
    const cancelInChannelEngine = async () => {
      try {
        const res = await fetch(
          `${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cancelPayload),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          console.warn('ChannelEngine cancel failed:', errText);
        } else {
          console.log(`[CancelPartialOrder] ${orderId}: ChannelEngine cancellation sent`);
        }
      } catch (err) {
        console.error(`[CancelPartialOrder] ${orderId}: ChannelEngine API error (ignored):`, err.message);
      }
    };

    // Order-level cancel (no shipment yet)
    if (typeof BLOCKED_STATUSES === 'object' && BLOCKED_STATUSES[order.status]) {
      return { success: false, error: { message: BLOCKED_STATUSES[order.status], status: 400 } };
    }

    await cancelInChannelEngine();

    // ---- Update SKU-level status and cancellation quantity ----
    const orderBeforeUpdate = await Order.findById(orderId).lean();

    const updatedSkuList = orderBeforeUpdate.orderSkuList.skuList.map((sku) => {
      const cancelItem = products.find((p) => p.orderLineId.toString() === sku.id.toString());
      if (!cancelItem) return sku;

      const cancelQty = cancelItem.quantity + sku.cancellationRequestedQuantity;

      // Partial cancel
      return {
        ...sku,
        status: ORDER_STATUS_MAP.PARTIALLY_CANCELED,
        cancellationRequestedQuantity: cancelQty,
      };
    });

    await Order.updateOne({ _id: orderId }, { $set: { 'orderSkuList.skuList': updatedSkuList } });

    // ---- Update overall order status ----
    const updatedOrder = await Order.findById(orderId).lean();

    const allCanceled = updatedOrder.orderSkuList.skuList.every((sku) => sku.status === ORDER_STATUS_MAP.CANCELED);

    if (allCanceled && updatedOrder.status !== ORDER_STATUS_MAP.CANCELED) {
      await Order.updateOne({ _id: orderId }, { $set: { status: ORDER_STATUS_MAP.CANCELED } });
      updatedOrder.status = ORDER_STATUS_MAP.CANCELED;
    }

    // ORDER LOG ENTRY with canceled SKU details
    const canceledItemsDescription = products
      .map((p) => `Product: ${p.merchantProductNo}, Quantity: ${p.quantity}`)
      .join('; ');

    const logEntry = {
      status: 'PARTIALLY CANCELED',
      description: `Order partially canceled — ${canceledItemsDescription}`,
      createdAt: new Date(),
    };

    await OrderLogs.updateOne({ orderId }, { $push: { details: logEntry } }, { upsert: true });

    return { success: true, data: updatedOrder };
  } catch (error) {
    console.error('cancelPartialOrder error:', error);
    return { success: false, error: { message: error.message, stack: error.stack } };
  }
};

export const formatOrderTrackingInf = (data) => {
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((item) => {
    const formatted = formatDateTime(item?.createdAt);

    return {
      status: item?.description || '',
      date: formatted?.date || '',
      time: formatted?.time || '',
    };
  });
};

export default {
  getAllOrders,
  getOrderById,
  processOrders,
  getNewOrders,
  getOrderStats,
  getOrderComparison,
  cancelOrder,
  acknowledgeOrder,
  backgroundAcknowledgementOrders,
  cancelFullOrder,
  cancelPartialOrder,
};
