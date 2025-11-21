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
import {
  formatDateTime,
  escapeCsv,
  generateCSVFilename,
  createCSVExportResponse,
  handleExportError,
  validateExportData,
  formatAddressForCSV,
} from '#helpers/Common.js';
import OrderLogs from '#models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#helpers/channelEngineErrorMessage.js';
import Channel from '../models/Channel.js';

const EXPORT_CHUNK_SIZE = parseInt(process.env.EXPORT_CHUNK_SIZE || '1000', 10); // Chunk size for CSV export processing

const formatOrder = (order, channelImage) => {
  const totalQuantity = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const totalPrice = order.totalInclVat
    ? order.totalInclVat
    : order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.lineVat || 0), 0) || 0;
  const customer = `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim();
  return {
    _id: order._id,
    channelNo: order.channelId || 1,
    orderID: order.orderId,
    quantity: totalQuantity,
    totalPrice: totalPrice,
    channelImage: channelImage || '',
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
        { 'orderCustomer.email': regex },
        { 'orderCustomer.firstName': regex },
        { 'orderCustomer.lastName': regex },
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

    const [totalOrders, orders, allChannels] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
        .collation({ locale: 'en_US', numericOrdering: true })
        .select(SELECTED_FIELDS)
        .lean(),

      Channel.find().select('_id channelId channelImageUrl'),
    ]);

    const channelMap = {};
    allChannels.forEach((channel) => {
      channelMap[channel.channelId] = channel.channelImageUrl;
    });

    return {
      data: orders.map((order) => {
        const matchingChannel = channelMap[order.channelId] || null;
        return formatOrder(order, matchingChannel);
      }),
      appliedFilters: appliedFilters,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return { success: false, message: err.message };
  }
};

const getAdminOrders = async (query, sellerId, channelId) => {
  try {
    const { page = 1, size = 10, search, fromDate, toDate, status, sortOrder = 'desc', sortBy = 'orderId' } = query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(size, 10) || 10, 1), 100);

    const skip = (pageNum - 1) * sizeNum;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};
    const filter = {};

    if (sellerId) {
      filter.sellerId = sellerId;
      appliedFilters.sellerId = sellerId;
    }

    if (channelId) {
      filter.channelId = channelId;
      appliedFilters.channelId = channelId;
    }

    const trimmedSearch = search?.trim();

    if (trimmedSearch && trimmedSearch.length <= 50) {
      const regex = { $regex: trimmedSearch, $options: 'i' };
      filter.$or = [
        { orderId: regex },
        { 'orderSkuList.skuList.description': regex },
        { 'orderCustomer.email': regex },
        { 'orderCustomer.firstName': regex },
        { 'orderCustomer.lastName': regex },
        { 'orderCustomer.phone': regex },
      ];
      appliedFilters.search = trimmedSearch;
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate && !isNaN(Date.parse(fromDate))) {
        filter.createdAt.$gte = new Date(fromDate);
      }
      if (toDate && !isNaN(Date.parse(toDate))) {
        filter.createdAt.$gte = new Date(toDate);
      }
      appliedFilters.fromDate = fromDate;
      appliedFilters.toDate = toDate;
    }

    if (status) {
      const statusArray = status.split(',').map((s) => s.trim().toUpperCase());
      filter.status = { $in: statusArray };
      appliedFilters.status = status;
    }

    const allowedSortFields = ['orderId', 'createdAt', 'status'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'orderId';

    const [totalOrders, orders, allChannels] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [safeSortBy]: sortDirection })
        .collation({ locale: 'en_US', numericOrdering: true })
        .select(SELECTED_FIELDS)
        .lean(),
      Channel.find().select('_id channelId channelImageUrl'),
    ]);

    const channelMap = {};
    allChannels.forEach((channel) => {
      channelMap[channel.channelId] = channel.channelImageUrl;
    });

    return {
      data: orders.map((order) => {
        const matchingChannel = channelMap[order.channelId] || null;
        return formatOrder(order, matchingChannel);
      }),
      appliedFilters,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
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
      if (
        (status === 'CANCELED' || status === 'PARTIALLY_CANCELED' || status === 'IN_COMBI') &&
        product?.cancellationRequestedQuantity !== 0
      ) {
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
          cancellationRequestedQuantity: product?.cancellationRequestedQuantity || 0,
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
          cancellationRequestedQuantity: product?.cancellationRequestedQuantity || 0,
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
      shipmentMode: shipment.shipmentMethod || 'AYMAKAN',
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

const cancelFullOrder = async (orderId, order, reason = 'NA') => {
  try {
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

    // Check if order has any shipped shipments
    const shippedShipments = await Shipment.find({
      orderId,
      status: { $in: ['SHIPPED', 'PICKED', 'DELIVERED'] },
    }).lean();

    if (shippedShipments.length > 0) {
      return {
        success: false,
        error: {
          message: 'Order has been shipped, cannot cancel now',
          status: 400,
        },
      };
    }

    const shipments = await Shipment.find({
      orderId,
      status: { $nin: ['CANCELED', 'PICKED', 'DELIVERED', 'SHIPPED'] },
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

    // Calculate shipped quantities per orderLineId
    const productLineIds = products.map((p) => p.orderLineId.toString());
    const shippedShipments = await Shipment.find({
      orderId,
      status: { $in: ['SHIPPED', 'PICKED', 'DELIVERED'] },
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    // Build map of shipped quantities per orderLineId
    const shippedQtyMap = {};
    shippedShipments.forEach((shipment) => {
      shipment.products.forEach((product) => {
        const lineId = product.orderLineId.toString();
        shippedQtyMap[lineId] = (shippedQtyMap[lineId] || 0) + (product.quantity || 0);
      });
    });

    // Validate each product to be canceled
    for (const cancelProduct of products) {
      const orderLineId = cancelProduct.orderLineId.toString();
      const orderSku = order.orderSkuList?.skuList?.find((sku) => sku.id.toString() === orderLineId);

      if (!orderSku) {
        return {
          success: false,
          error: {
            message: `Product with orderLineId ${orderLineId} not found in order`,
            status: 404,
          },
        };
      }

      const orderedQty = orderSku.quantity || 0;
      const alreadyCanceledQty = orderSku.cancellationRequestedQuantity || 0;
      const shippedQty = shippedQtyMap[orderLineId] || 0;
      const availableToCancel = orderedQty - alreadyCanceledQty - shippedQty;

      // Check if trying to cancel more than available
      if (cancelProduct.quantity > availableToCancel) {
        return {
          success: false,
          error: {
            message: `Cannot cancel ${cancelProduct.quantity} units of ${cancelProduct.merchantProductNo}. Only ${availableToCancel} units available to cancel (${orderedQty} ordered, ${alreadyCanceledQty} already canceled, ${shippedQty} shipped)`,
            status: 400,
          },
        };
      }
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

export const exportOrdersToCSV = async (sellerId = null, filters = {}) => {
  try {
    const {
      status,
      platform,
      search,
      fromDate,
      toDate,
      size = 10000, // Export a large number by default
      sortBy = 'orderDate',
      sortOrder = 'desc',
    } = filters;

    const filter = { sellerId: sellerId };

    // Apply filters similar to getAllOrders
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { orderId: regex },
        { merchantOrderNo: regex },
        { 'orderCustomer.firstName': regex },
        { 'orderCustomer.lastName': regex },
        { 'orderCustomer.email': regex },
      ];
    }

    if (platform) {
      filter.channelName = { $regex: new RegExp(platform, 'i') };
    }

    if (fromDate || toDate) {
      filter.orderDate = {};
      if (fromDate) filter.orderDate.$gte = new Date(fromDate);
      if (toDate) filter.orderDate.$lte = new Date(toDate);
    }

    if (status) {
      const statusList = status.split(',').map((s) => s.trim());
      const validStatuses = statusList.filter((s) => Object.keys(ORDER_STATUS_MAP).includes(s.toUpperCase()));
      if (validStatuses.length > 0) {
        filter.status = { $in: validStatuses };
      }
    }

    // Sorting
    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    // Fetch orders and count in parallel for better performance
    const [orders, totalCount] = await Promise.all([
      Order.find(filter).sort(sort).limit(parseInt(size, 10)).lean(),
      Order.countDocuments(filter),
    ]);

    // Validate export data
    const validation = validateExportData(orders, 'orders');
    if (!validation.success) {
      return validation;
    }

    // Define CSV headers with multi-product support
    const headers = [
      'ID',
      'Order ID',
      'Seller ID',
      'Channel ID',
      'Global Channel ID',
      'Status',
      'Global Channel Name',
      'Channel Name',
      'Order Date',
      'Merchant Comment',
      'Merchant Order No',
      'Is Business Order',
      'Sub Total Incl VAT',
      'Sub Total VAT',
      'Shipping Costs Incl VAT',
      'Shipping Costs VAT',
      'Total Incl VAT',
      'Total VAT',
      'Original Sub Total Incl VAT',
      'Original Sub Total VAT',
      'Original Shipping Costs Incl VAT',
      'Original Shipping Costs VAT',
      'Original Total Incl VAT',
      'Original Total VAT',
      'Sub Total Excl VAT',
      'Total Excl VAT',
      'Shipping Costs Excl VAT',
      'Original Sub Total Excl VAT',
      'Original Shipping Costs Excl VAT',
      'Original Total Excl VAT',
      'Original Sub Total Fee',
      'Sub Total Fee',
      'Original Order Fee',
      'Order Fee',
      'Original Total Fee',
      'Total Fee',
      'Customer First Name',
      'Customer Last Name',
      'Customer Email',
      'Customer Phone',
      'Customer Company Name',
      'Customer VAT Number',
      'Shipping Address Line 1',
      'Shipping Address Line 2',
      'Shipping Address Line 3',
      'Shipping Address City',
      'Shipping Address Region',
      'Shipping Address Zip Code',
      'Shipping Address Country ISO',
      'Billing Address Line 1',
      'Billing Address Line 2',
      'Billing Address Line 3',
      'Billing Address City',
      'Billing Address Region',
      'Billing Address Zip Code',
      'Billing Address Country ISO',
      'Payment Method',
      'Currency Code',
      'Products Count',
      'Total Products Quantity',
      'Product SKU',
      'Product Line ID',
      'Product Description',
      'Product Quantity',
      'Product Unit Price Incl VAT',
      'Product Line Total Incl VAT',
      'Product Status',
      'Created At',
      'Updated At',
    ];

    const csvRows = [headers.join(',')];

    // Process orders in parallel chunks for better performance
    const chunks = [];
    for (let i = 0; i < orders.length; i += EXPORT_CHUNK_SIZE) {
      chunks.push(orders.slice(i, i + EXPORT_CHUNK_SIZE));
    }

    // Process each chunk in parallel
    const processChunk = async (chunk) => {
      return chunk.map((order) => {
        const shippingAddress = formatAddressForCSV(order.orderShippingAddress);
        const billingAddress = formatAddressForCSV(order.orderBillingAddress);
        const skuList = order.orderSkuList?.skuList || [];

        // Calculate product stats
        const productCount = skuList.length;
        const totalQuantity = skuList.reduce((sum, sku) => sum + (sku.quantity || 0), 0);

        // Base order data (same for all product rows)
        const baseRow = [
          order._id?.toString() || 'N/A',
          order.orderId || 'N/A',
          order.sellerId?.toString() || 'N/A',
          order.channelId || 'N/A',
          order.globalChannelId || 'N/A',
          order.status || 'N/A',
          order.globalChannelName || 'N/A',
          order.channelName || 'N/A',
          formatDateTime(order.orderDate)?.date || 'N/A',
          order.merchantComment || 'N/A',
          order.merchantOrderNo || 'N/A',
          order.isBusinessOrder ? 'Yes' : 'No',
          order.subTotalInclVat || 0,
          order.subTotalVat || 0,
          order.shippingCostsInclVat || 0,
          order.shippingCostsVat || 0,
          order.totalInclVat || 0,
          order.totalVat || 0,
          order.originalSubTotalInclVat || 0,
          order.originalSubTotalVat || 0,
          order.originalShippingCostsInclVat || 0,
          order.originalShippingCostsVat || 0,
          order.originalTotalInclVat || 0,
          order.originalTotalVat || 0,
          order.subTotalExclVat || 0,
          order.totalExclVat || 0,
          order.shippingCostsExclVat || 0,
          order.originalSubTotalExclVat || 0,
          order.originalShippingCostsExclVat || 0,
          order.originalTotalExclVat || 0,
          order.originalSubTotalFee || 0,
          order.subTotalFee || 0,
          order.originalOrderFee || 0,
          order.orderFee || 0,
          order.originalTotalFee || 0,
          order.totalFee || 0,
          order.orderCustomer?.firstName || 'N/A',
          order.orderCustomer?.lastName || 'N/A',
          order.orderCustomer?.email || 'N/A',
          order.orderCustomer?.phone || 'N/A',
          order.orderCustomer?.companyName || 'N/A',
          order.orderPaymentDetails?.vatNo || 'N/A',
          ...shippingAddress,
          ...billingAddress,
          order.orderPaymentDetails?.paymentMethod || 'N/A',
          order.orderPaymentDetails?.currencyCode || 'N/A',
          productCount,
          totalQuantity,
        ];

        // Handle multi-product data similar to shipments
        let productSKUs = 'N/A';
        let productLineIds = 'N/A';
        let productDescriptions = 'N/A';
        let productQuantities = 'N/A';
        let productUnitPrices = 'N/A';
        let productLineTotals = 'N/A';
        let productStatuses = 'N/A';

        if (skuList && skuList.length > 0) {
          if (skuList.length === 1) {
            // Single product - show actual data
            const product = skuList[0];
            productSKUs = product.merchantProductNo || 'N/A';
            productLineIds = product.id || 'N/A';
            productDescriptions = product.description || 'N/A';
            productQuantities = product.quantity || 0;
            productUnitPrices = product.unitPriceInclVat || 0;
            productLineTotals = product.lineTotalInclVat || 0;
            productStatuses = product.status || 'N/A';
          } else {
            // Multiple products - show header + details
            const skus = skuList.map((p) => p.merchantProductNo || 'N/A');
            const lineIds = skuList.map((p) => p.id || 'N/A');
            const descriptions = skuList.map((p) => p.description || 'N/A');
            const quantities = skuList.map((p) => p.quantity || 0);
            const unitPrices = skuList.map((p) => p.unitPriceInclVat || 0);
            const lineTotals = skuList.map((p) => p.lineTotalInclVat || 0);
            const statuses = skuList.map((p) => p.status || 'N/A');

            productSKUs = 'MULTI-PRODUCTS\n' + skus.join('\n');
            productLineIds = 'MULTI-PRODUCTS\n' + lineIds.join('\n');
            productDescriptions = 'MULTI-PRODUCTS\n' + descriptions.join('\n');
            productQuantities = 'MULTI-PRODUCTS\n' + quantities.join('\n');
            productUnitPrices = 'MULTI-PRODUCTS\n' + unitPrices.join('\n');
            productLineTotals = 'MULTI-PRODUCTS\n' + lineTotals.join('\n');
            productStatuses = 'MULTI-PRODUCTS\n' + statuses.join('\n');
          }
        }

        const singleRow = [
          ...baseRow,
          productSKUs,
          productLineIds,
          productDescriptions,
          productQuantities,
          productUnitPrices,
          productLineTotals,
          productStatuses,
          formatDateTime(order.createdAt)?.date || 'N/A',
          formatDateTime(order.updatedAt)?.date || 'N/A',
        ];

        return escapeCsv(singleRow);
      });
    };

    // Process all chunks in parallel
    const processedChunks = await Promise.all(chunks.map(processChunk));

    csvRows.push(...processedChunks.flat());
    const filename = generateCSVFilename('orders');

    return {
      ...createCSVExportResponse(csvRows, filename, orders.length),
      totalCount,
    };
  } catch (error) {
    return handleExportError(error, 'orders');
  }
};

export default {
  getAllOrders,
  getAdminOrders,
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
  exportOrdersToCSV,
};
