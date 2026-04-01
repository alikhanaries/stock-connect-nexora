import Order from '#models/Orders.js';
import mongoose from 'mongoose';
import { getPagination } from '#helpers/PaginationHandler.js';
import {
  ORDER_STATUS_MAP,
  SELECTED_FIELDS,
  BLOCKED_STATUSES,
  ORDER_EXPORT_EXCLUDED_COLUMNS,
} from '#constants/common.js';
import orderhelper, {
  flattenAggregatedOrder,
  getAggregatedOrderHeaders,
  getOrganizedOrderRowData,
} from '#helpers/Order.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { randomBytes } from 'node:crypto';
import Shipment from '../models/Shipment/Shipment.js';
import Product from '../models/Product.js';
import { cancelAymakanShipment } from '#service/aymakanService.js';
import { formatShipmentTrackingInfo } from '#service/shipmentService.js';
import { formatDateTime, truncate, resolveDateRange } from '#helpers/Common.js';
import { escapeCsv, createCSVExportResponse, validateExportData, generateDynamicHeaders } from '#helpers/export.js';
import OrderLogs from '#models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#helpers/channelEngineErrorMessage.js';
import Channel from '../models/Channel.js';
import Seller from '../models/Seller.js';

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
    sellerId: order.sellerId,
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
      sortBy = 'orderDate',
      channel = '',
    } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    // Convert sellerId to ObjectId
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

    // Base match stage
    const filter = {
      sellerId: sellerObjectId,
    };
    // Escape special regex characters
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/);

      filter.$and = words.map((word) => {
        const safeWord = escapeRegex(word);

        const regex = {
          $regex: safeWord,
          $options: 'i',
        };

        return {
          $or: [
            { orderId: regex },
            { 'orderCustomer.email': regex },
            { 'orderCustomer.firstName': regex },
            { 'orderCustomer.lastName': regex },
            { channelOrderNumber: regex },
          ],
        };
      });
      appliedFilters.search = search;
    }

    if (channel) {
      const channelArray = channel.split(',').map((s) => s.trim());
      filter.channelName = {
        $in: channelArray.map((s) => new RegExp(`${escapeRegex(s)}`, 'i')),
      };
      appliedFilters.channel = channel;
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

    // Build aggregation pipeline
    const pipeline = [{ $match: filter }];

    if (status && status.toUpperCase().includes('DELIVERED')) {
      appliedFilters.status = 'DELIVERED';

      // Filter delivered SKUs using $filter to keep skuList as an array
      pipeline.push({
        $addFields: {
          'orderSkuList.skuList': {
            $filter: {
              input: '$orderSkuList.skuList',
              as: 'sku',
              cond: {
                $and: [
                  { $eq: ['$$sku.statusBreakdown.confirmed', 0] },
                  { $eq: ['$$sku.statusBreakdown.shipped', 0] },
                  { $eq: ['$$sku.statusBreakdown.returned', 0] },
                  {
                    $eq: [
                      {
                        $add: ['$$sku.statusBreakdown.delivered', '$$sku.statusBreakdown.canceled'],
                      },
                      '$$sku.quantity',
                    ],
                  },
                  { $gt: ['$$sku.statusBreakdown.delivered', 0] }, //  delivered must be > 0
                ],
              },
            },
          },
        },
      });

      // Remove orders that have no delivered SKUs
      pipeline.push({
        $match: {
          'orderSkuList.skuList.0': { $exists: true },
        },
      });
    } else if (status) {
      // Normal status filter
      const statusArray = status.split(',').map((s) => s.trim().toUpperCase());
      const validStatuses = Object.values(ORDER_STATUS_MAP);
      const invalid = statusArray.filter((s) => !validStatuses.includes(s));

      if (invalid.length) {
        throw new Error(`Invalid status: ${invalid.join(', ')}. Valid statuses are: ${validStatuses.join(', ')}`);
      }

      // Build Mongo filter (case-insensitive)
      filter.status = {
        $in: statusArray.map((s) => new RegExp(`^${s}$`, 'i')),
      };

      appliedFilters.status = status;
      pipeline[0] = { $match: filter };
    }

    // Sorting, skip, limit
    pipeline.push({ $sort: { [sortBy]: sortDirection } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(size) });

    // Execute aggregation and fetch other data
    const [totalOrders, orders, allChannels, sellerSync] = await Promise.all([
      Order.countDocuments(filter),
      Order.aggregate(pipeline),
      Channel.find().select('_id channelId channelImageUrl'),
      Seller.findById(sellerId).select('-_id lastOrderSync'),
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
      latestOrderSyncDate: sellerSync.lastOrderSync || null,
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
    const order = await Order.findById(id).lean();
    if (!order) return false;
    const shipments = await Shipment.find({
      orderId: id,
      type: 'FORWARD',
      status: { $ne: 'CANCELED' },
    }).lean();

    const allOrderSkus = order.orderSkuList?.skuList || [];

    // ---------------- PRODUCT IMAGE MAP ----------------
    const merchantNos = allOrderSkus.map((s) => s.merchantProductNo);

    const productsMap = await Product.find(
      { productSkuCode: { $in: merchantNos } },
      { productSkuCode: 1, images: 1, hsCodeSA: 1 }
    )
      .lean()
      .then((rows) =>
        rows.reduce((acc, p) => {
          acc[p.productSkuCode] = {
            image: p.images?.[0] || null,
            hsCode: p.hsCodeSA || p.productSkuCode,
          };
          return acc;
        }, {})
      );

    // ---------------- ITEM GROUPS ----------------
    const unshippedItems = [];
    const cancelledItems = [];

    allOrderSkus.forEach((sku) => {
      const b = sku.statusBreakdown || {};
      const image = productsMap[sku.merchantProductNo]?.image || null;
      const hsCode = productsMap[sku.merchantProductNo]?.hsCode || sku.merchantProductNo;

      // ---------- CANCELLED ----------
      if (b.canceled > 0) {
        cancelledItems.push({
          id: sku.id,
          merchantProductNo: sku.merchantProductNo,
          channelProductNo: sku.channelProductNo,
          name: sku.description,
          imageUrl: image,
          quantity: b.canceled,
          status: 'CANCELED',
          hsCode,
        });
      }

      // ---------- UNSHIPPED (CONFIRMED + SHIPMENT CREATED) ----------
      const pendingQty = b.confirmed || 0;

      if (pendingQty > 0) {
        unshippedItems.push({
          id: sku.id,
          merchantProductNo: sku.merchantProductNo,
          channelProductNo: sku.channelProductNo,
          name: sku.description,
          imageUrl: image,
          quantity: pendingQty,
          status: sku.status, // stays IN_PROGRESS
          hsCode,
        });
      }
    });

    // ---------------- SPLIT SHIPMENTS ----------------
    const shippedItems = [];
    const deliveredItems = [];

    shipments.forEach((shipment) => {
      const target = shipment.status === 'DELIVERED' ? deliveredItems : shippedItems;

      target.push({
        shipmentStatus: shipment.status || 'SHIPMENT_CREATED',
        shipmentId: shipment._id,
        trackingNumber: shipment.airWaybillNo || null,
        shipmentMode: shipment.shipmentMethod || 'AYMAKAN',
        lineItems:
          shipment.products?.map((p) => {
            const sku = allOrderSkus.find((s) => s.merchantProductNo === p.merchantProductNo);

            return {
              id: sku?.id,
              merchantProductNo: p.merchantProductNo,
              channelProductNo: sku?.channelProductNo,
              name: sku?.description,
              imageUrl: productsMap[p.merchantProductNo]?.image || null,
              quantity: p.quantity,
              status: sku?.status,
              airWaybillNo: shipment.airWaybillNo,
              hsCode: productsMap[p.merchantProductNo]?.hsCode || p.merchantProductNo,
              trackingInfo: formatShipmentTrackingInfo(shipment?.trackingInfo) || [],
            };
          }) || [],
      });
    });

    // ---------------- FINAL RESPONSE ----------------
    const filteredData = transformOrderResponse(allOrderSkus, order);

    const orderLogsDetails = await OrderLogs.findOne({ orderId: id }).lean();
    const orderLogsData = orderLogsDetails?.details?.length ? formatOrderTrackingInf(orderLogsDetails.details) : [];
    const productsStatusDetails = allOrderSkus.map((sku) => {
      const b = sku.statusBreakdown || {};

      return {
        id: sku.id,
        productCode: sku.merchantProductNo,
        totalQty: sku.quantity,
        confirmed: b.confirmed || 0,
        shipmentCreated: b.shipmentCreated || 0,
        shipped: b.shipped || 0,
        delivered: b.delivered || 0,
        returned: b.returned || 0,
        canceled: b.canceled || 0,
      };
    });

    return {
      ...filteredData,
      shippedItems,
      deliveredItems,
      unshippedItems,
      cancelledItems,
      orderLogsData,
      productsStatusDetails,
    };
  } catch (err) {
    console.error(err);
    throw err;
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
    let page = 1;
    const pageSize = 100;
    let allOrders = [];
    let hasMore = true;

    while (hasMore && page <= 5) {
      const response = await fetch(
        `${CHANNEL_ENGINE_BASE_URL}orders?apiKey=${CHANNEL_ENGINE_API_KEY}&page=${page}&pageSize=${pageSize}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();

      if (!data?.Content?.length) {
        hasMore = false;
        break;
      }

      const orderData = data.Content.filter((order) => order.GlobalChannelId !== 1635);

      allOrders.push(...orderData);

      const fetchedCount = page * pageSize;
      hasMore = fetchedCount < data.TotalCount;

      page++;
    }
    return {
      success: true,
      data: allOrders,
    };
  } catch (error) {
    console.error('Error fetching orders from ChannelEngine:', error.message);
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

const transformOrderResponse = (allOrderSkus, response) => {
  if (!response) return null;
  const data = response;

  // ---- Calculate totals from SKUs ----
  const totals = allOrderSkus.reduce(
    (acc, sku) => {
      //    const shippableQty = (sku.quantity || 0) - (sku.cancellationRequestedQuantity || 0);
      const shippableQty = sku.quantity || 0;
      const unitExclVat = sku.unitPriceExclVat || 0;
      const unitVat = sku.unitVat || 0;
      const unitInclVat = sku.unitPriceInclVat || 0;

      acc.subtotal += unitExclVat * shippableQty;
      acc.tax += unitVat * shippableQty;
      acc.total += unitInclVat * shippableQty;

      return acc;
    },
    { subtotal: 0, tax: 0, total: 0 }
  );

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
    country: data.orderShippingAddress?.countryIso,
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

    // Calculated values
    subtotal: truncate(totals.subtotal),
    tax: truncate(totals.tax),
    total: truncate(totals.total),

    shippingFee: Number(data.shippingCostsInclVat) || 0,
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
      status: { $in: ['SHIPPED', 'DELIVERED'] },
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
      status: { $nin: ['CANCELED', 'DELIVERED', 'SHIPPED'] },
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
      [
        {
          $set: {
            status: ORDER_STATUS_MAP.CANCELED,
            'orderSkuList.skuList': {
              $map: {
                input: '$orderSkuList.skuList',
                as: 'sku',
                in: {
                  $mergeObjects: [
                    '$$sku',
                    {
                      status: ORDER_STATUS_MAP.CANCELED,
                      statusBreakdown: {
                        confirmed: 0,
                        shipped: 0,
                        delivered: 0,
                        returned: 0,
                        canceled: '$$sku.quantity',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true }
    );

    // ORDER LOG ENTRY
    const logEntry = {
      status: 'CANCELED',
      description: `Canceled all items`,
      createdAt: new Date(),
    };
    await OrderLogs.updateOne({ orderId }, { $push: { details: logEntry } }, { upsert: true });

    return { success: true, data: updatedOrder.toObject() };
  } catch (error) {
    console.error('cancelFullOrder error:', error);
    return { success: false, error: { message: error.message } };
  }
};

export const cancelPartialOrder = async (orderId, products, reason = 'NA') => {
  try {
    // ----------------------------------------------------
    // FETCH ORDER
    // ----------------------------------------------------
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return { success: false, error: { message: 'Order not found', status: 404 } };
    }

    const productLineIds = products.map((p) => p.orderLineId.toString());

    // ----------------------------------------------------
    // FETCH SHIPMENTS (AFFECTING THESE SKUS)
    // ----------------------------------------------------
    const shipments = await Shipment.find({
      orderId,
      status: { $in: ['SHIPMENT_CREATED', 'SHIPPED', 'DELIVERED'] },
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    // ----------------------------------------------------
    // BUILD SHIPMENT QTY MAPS
    // ----------------------------------------------------
    const shippedQtyMap = {};
    const shipmentCreatedQtyMap = {};
    const deliveredQtyMap = {};

    shipments.forEach((shipment) => {
      shipment.products.forEach((p) => {
        const lineId = p.orderLineId.toString();
        const qty = p.quantity || 0;

        if (shipment.status === 'SHIPMENT_CREATED') {
          shipmentCreatedQtyMap[lineId] = (shipmentCreatedQtyMap[lineId] || 0) + qty;
        }

        if (shipment.status === 'SHIPPED') {
          shippedQtyMap[lineId] = (shippedQtyMap[lineId] || 0) + qty;
        }

        if (shipment.status === 'DELIVERED') {
          deliveredQtyMap[lineId] = (deliveredQtyMap[lineId] || 0) + qty;
        }
      });
    });

    // ----------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------
    for (const item of products) {
      const lineId = item.orderLineId.toString();

      const sku = order.orderSkuList.skuList.find((s) => s.id.toString() === lineId);

      if (!sku) {
        return {
          success: false,
          error: { message: `SKU ${lineId} not found`, status: 404 },
        };
      }

      const orderedQty = sku.quantity || 0;
      const alreadyCanceled = sku.cancellationRequestedQuantity || 0;
      const shippedQty = shippedQtyMap[lineId] || 0;
      const deliveredQty = deliveredQtyMap[lineId] || 0;

      const availableToCancel = orderedQty - alreadyCanceled - shippedQty - deliveredQty;

      if (item.quantity > availableToCancel) {
        return {
          success: false,
          error: {
            message: `Cannot cancel ${item.quantity}. Only ${availableToCancel} available.`,
            status: 400,
          },
        };
      }
    }

    // ----------------------------------------------------
    // SEND CANCEL TO CHANNEL ENGINE (FIRE & FORGET)
    // ----------------------------------------------------
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

    fetch(`${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelPayload),
    }).catch((err) => console.error('ChannelEngine cancel failed (ignored):', err.message));

    // REBUILD SKU LIST (SOURCE OF TRUTH)

    const updatedSkuList = order.orderSkuList.skuList.map((sku) => {
      const lineId = sku.id.toString();

      // check if this SKU exists in cancel payload
      const cancelItem = products.find((p) => p.orderLineId.toString() === lineId);

      if (!cancelItem) {
        return sku;
      }

      const orderedQty = sku.quantity || 0;
      const prevCanceled = sku.cancellationRequestedQuantity || 0;
      const shippedQty = shippedQtyMap[lineId] || 0;
      const deliveredQty = deliveredQtyMap[lineId] || 0;
      const shipmentCreatedQty = sku?.statusBreakdown?.shipmentCreated || 0;

      const newlyCanceled = cancelItem.quantity;
      const canceledQty = prevCanceled + newlyCanceled;

      const confirmedQty = orderedQty - canceledQty - shippedQty - deliveredQty - shipmentCreatedQty;

      return {
        ...sku,
        status: canceledQty === orderedQty ? ORDER_STATUS_MAP.CANCELED : ORDER_STATUS_MAP.IN_PROGRESS,

        cancellationRequestedQuantity: canceledQty,

        statusBreakdown: {
          confirmed: Math.max(0, confirmedQty),
          shipped: shippedQty,
          delivered: deliveredQty,
          returned: 0,
          canceled: canceledQty,
          shipmentCreated: shipmentCreatedQty,
        },
      };
    });

    await Order.updateOne({ _id: orderId }, { $set: { 'orderSkuList.skuList': updatedSkuList } });

    // ----------------------------------------------------
    // RESOLVE ORDER STATUS
    // ----------------------------------------------------
    const totalQty = updatedSkuList.reduce((s, sku) => s + sku.quantity, 0);
    const canceledQty = updatedSkuList.reduce((s, sku) => s + (sku.cancellationRequestedQuantity || 0), 0);

    const shippedQty = Object.values(shippedQtyMap).reduce((a, b) => a + b, 0);
    const shipmentCreatedQty = Object.values(shipmentCreatedQtyMap).reduce((a, b) => a + b, 0);
    const deliveredQty = Object.values(deliveredQtyMap).reduce((a, b) => a + b, 0);

    const remainingQty = totalQty - canceledQty - shippedQty - shipmentCreatedQty - deliveredQty;

    let orderStatus = ORDER_STATUS_MAP.IN_PROGRESS;

    if (remainingQty <= 0) {
      if (shipmentCreatedQty > 0) orderStatus = ORDER_STATUS_MAP.IN_PROGRESS;
      else if (shippedQty > 0) orderStatus = ORDER_STATUS_MAP.SHIPPED;
      else if (deliveredQty > 0) orderStatus = ORDER_STATUS_MAP.DELIVERED;
      else orderStatus = ORDER_STATUS_MAP.CANCELED;
    }

    await Order.updateOne({ _id: orderId }, { $set: { status: orderStatus } });

    // ----------------------------------------------------
    // LOG
    // ----------------------------------------------------
    await OrderLogs.updateOne(
      { orderId },
      {
        $push: {
          details: {
            status: orderStatus,
            description: `Partial cancel: ${products.map((p) => `${p.merchantProductNo} x${p.quantity}`).join(', ')}`,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true }
    );

    return { success: true };
  } catch (error) {
    console.error('cancelPartialOrder error:', error);
    return { success: false, error: { message: error.message } };
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

export const exportOrdersToCSV = async (sellerId, filters = {}, sellerName = '') => {
  try {
    // Validate sellerId is provided
    if (!sellerId) {
      return {
        success: false,
        message: 'Seller ID is required for export',
      };
    }

    const { status, channel, search, size = 100000, sortBy = 'orderDate', sortOrder = 'desc' } = filters;

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

    if (channel) {
      const channelArray = channel.split(',').map((s) => s.trim());
      filter.channelName = {
        $in: channelArray.map((s) => new RegExp(`${s}`, 'i')),
      };
    }

    if (status) {
      const statusArray = status.split(',').map((s) => s.trim().toUpperCase());

      // Validate against enum
      const validStatuses = Object.values(ORDER_STATUS_MAP);
      const invalid = statusArray.filter((s) => !validStatuses.includes(s));

      if (invalid.length > 0) {
        console.warn(`Invalid status values ignored: ${invalid.join(', ')}`);
      }

      // Build Mongo filter (case-insensitive) - only use valid statuses
      const validStatusArray = statusArray.filter((s) => validStatuses.includes(s));

      if (validStatusArray.length > 0) {
        filter.status = {
          $in: validStatusArray.map((s) => new RegExp(`^${s}$`, 'i')),
        };
      }
    }

    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const [orders, totalCount] = await Promise.all([
      Order.find(filter).sort(sort).limit(parseInt(size, 10)).lean(),
      Order.countDocuments(filter),
    ]);

    // Validate export data
    const validation = validateExportData(orders, 'orders');
    if (!validation.success) {
      return validation;
    }

    const dynamicHeaders = generateDynamicHeaders(Order, [
      'orderSkuList',
      'orderCustomer',
      'orderPaymentDetails',
      'orderShippingAddress',
      'orderBillingAddress',
    ]);

    // Get a sample order to determine aggregated headers structure
    const sampleOrder = orders[0];
    const { customerHeaders, paymentHeaders, shippingHeaders, billingHeaders, skuHeaders } =
      getAggregatedOrderHeaders(sampleOrder);

    const filteredDynamicHeaders = dynamicHeaders.filter(
      (header) =>
        !header.startsWith('orderSkuList') &&
        !(header.includes('orderId') && header.includes('_')) && // <-- allow top-level 'orderId'
        !header.includes('createdAt') &&
        !header.includes('updatedAt')
    );

    // Combine all headers in the desired order
    const combinedHeaders = [
      ...filteredDynamicHeaders,
      ...skuHeaders,
      ...shippingHeaders,
      ...billingHeaders,
      ...customerHeaders,
      ...paymentHeaders,
      'createdAt',
      'updatedAt',
    ];

    // Remove any duplicate headers
    const deduplicatedHeaders = [...new Set(combinedHeaders)];

    // Filter out excluded columns
    const organizedHeaders = deduplicatedHeaders.filter((header) => !ORDER_EXPORT_EXCLUDED_COLUMNS.includes(header));

    // Create CSV with organized headers
    const csvRows = [organizedHeaders.join(',')];

    // Process orders in chunks for better performance
    const chunks = [];
    for (let i = 0; i < orders.length; i += EXPORT_CHUNK_SIZE) {
      chunks.push(orders.slice(i, i + EXPORT_CHUNK_SIZE));
    }

    // Process each chunk
    const processChunk = async (chunk) => {
      return chunk.map((order) => {
        // Flatten the aggregated order data
        const flattenedOrder = flattenAggregatedOrder(order);

        // Get organized row data
        const rowData = getOrganizedOrderRowData(flattenedOrder, organizedHeaders);

        return escapeCsv(rowData);
      });
    };

    // Process all chunks in parallel
    const processedChunks = await Promise.all(chunks.map(processChunk));
    csvRows.push(...processedChunks.flat());

    // Generate filename with seller name
    const sanitizedSellerName = sellerName.replace(/[^a-zA-Z0-9]/g, '');
    const exportDate = new Date().toISOString().split('T')[0];
    const filename = `${sanitizedSellerName}_OrderExport_${exportDate}.csv`;

    return {
      ...createCSVExportResponse(csvRows, filename, orders.length),
      totalCount,
    };
  } catch (error) {
    console.error('Error exporting orders:', error.message);
    throw error;
  }
};

const getAnalyticsOrders = async (query) => {
  try {
    const {
      page = 1,
      size = 10,
      search,
      statuses = [],
      sortOrder = 'desc',
      sortBy = 'orderDate',
      sellerIds = [],
      channels = [],
    } = query;

    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const appliedFilters = {};
    const filter = {};

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // -------------------------
    // SELLER FILTER
    // -------------------------
    let sellerObjectIds = [];

    if (sellerIds.length) {
      sellerObjectIds = sellerIds.map((id) => new mongoose.Types.ObjectId(id));
      appliedFilters.sellerIds = sellerIds;
    }

    // -------------------------
    // CHANNEL FILTER
    // -------------------------
    if (channels.length) {
      filter.channelName = {
        $in: channels.map((ch) => new RegExp(escapeRegex(ch), 'i')),
      };
      appliedFilters.channel = channels;
    }

    // -------------------------
    // SEARCH
    // -------------------------
    if (search && search.trim()) {
      const words = search.trim().split(/\s+/);

      filter.$and = words.map((word) => {
        const regex = {
          $regex: escapeRegex(word),
          $options: 'i',
        };

        return {
          $or: [
            { orderId: regex },
            { 'orderCustomer.email': regex },
            { 'orderCustomer.firstName': regex },
            { 'orderCustomer.lastName': regex },
            { channelOrderNumber: regex },
          ],
        };
      });

      appliedFilters.search = search;
    }

    // -------------------------
    // DATE FILTER
    // -------------------------
    const { start, end, appliedPeriod } = resolveDateRange(query);

    if (start && end) {
      filter.orderDate = {
        $gte: start,
        $lte: end,
      };

      appliedFilters.period = appliedPeriod;
      appliedFilters.fromDate = start.toISOString();
      appliedFilters.toDate = end.toISOString();
    }

    // -------------------------
    // BASE PIPELINE
    // -------------------------
    let pipeline = [{ $match: filter }];

    // -------------------------
    // SELLER VALIDATION
    // -------------------------
    pipeline.push({
      $lookup: {
        from: 'sellers',
        localField: 'sellerId',
        foreignField: '_id',
        as: 'seller',
      },
    });

    pipeline.push({
      $unwind: '$seller',
    });

    pipeline.push({
      $match: {
        'seller.isDeleted': false,
        'seller.type': 'normal',
      },
    });

    // -------------------------
    // APPLY SELLER IDS FILTER
    // -------------------------
    if (sellerObjectIds.length) {
      pipeline.push({
        $match: {
          sellerId: { $in: sellerObjectIds },
        },
      });
    }

    // -------------------------
    // STATUS HANDLING (UPDATED)
    // -------------------------
    if (statuses.length) {
      const statusArray = statuses.map((s) => s.toUpperCase());

      const validStatuses = Object.values(ORDER_STATUS_MAP);

      const invalid = statusArray.filter((s) => !validStatuses.includes(s));

      if (invalid.length) {
        throw new Error(`Invalid status: ${invalid.join(', ')}. Valid statuses are: ${validStatuses.join(', ')}`);
      }

      // 🔥 MAP: DELIVERED → CLOSED
      const mappedStatuses = statusArray.map((s) => (s === 'DELIVERED' ? 'CLOSED' : s));

      const hasDelivered = statusArray.includes('DELIVERED');

      if (hasDelivered) {
        pipeline.push({
          $match: {
            status: 'CLOSED',
          },
        });

        appliedFilters.status = 'DELIVERED';
      } else {
        pipeline[0].$match.status = {
          $in: mappedStatuses.map((s) => new RegExp(escapeRegex(s), 'i')),
        };

        appliedFilters.status = statuses;
      }
    }

    // -------------------------
    // SORT + PAGINATION
    // -------------------------
    pipeline.push({ $sort: { [sortBy]: sortDirection } }, { $skip: skip }, { $limit: parseInt(size) });

    // -------------------------
    // COUNT PIPELINE
    // -------------------------
    const countPipeline = pipeline.slice(0, -3);
    countPipeline.push({ $count: 'total' });

    // -------------------------
    // EXECUTION
    // -------------------------
    const [orders, countResult, allChannels, sellerSyncs] = await Promise.all([
      Order.aggregate(pipeline),
      Order.aggregate(countPipeline),
      Channel.find().select('_id channelId channelImageUrl'),
      Seller.find(sellerObjectIds.length ? { _id: { $in: sellerObjectIds } } : {})
        .select('lastOrderSync')
        .lean(),
    ]);

    const totalOrders = countResult[0]?.total || 0;

    const channelMap = {};
    allChannels.forEach((c) => {
      channelMap[c.channelId] = c.channelImageUrl;
    });

    const latestOrderSyncDate = sellerSyncs.length
      ? sellerSyncs.reduce((max, s) => {
          if (!s.lastOrderSync) return max;
          return !max || s.lastOrderSync > max ? s.lastOrderSync : max;
        }, null)
      : null;

    return {
      data: orders.map((order) => {
        const matchingChannel = channelMap[order.channelId] || null;
        return formatOrder(order, matchingChannel);
      }),
      appliedFilters,
      latestOrderSyncDate,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
    console.error('Error fetching orders:', err);
    return { success: false, message: err.message };
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
  getAnalyticsOrders,
};
