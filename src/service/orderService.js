import Order from '#models/Orders.js';
import mongoose from 'mongoose';
import { getPagination } from '#helpers/PaginationHandler.js';
import { ORDER_STATUS_MAP, SELECTED_FIELDS, BLOCKED_STATUSES } from '#constants/common.js';
import orderhelper from '#helpers/Order.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { randomBytes } from 'node:crypto';
import Shipment from '../models/Shipment/Shipment.js';
import Product from '../models/Product.js';
import { cancelAymakanShipment } from '#service/aymakanService.js';
import { formatShipmentTrackingInfo } from '#service/shipmentService.js';
import { formatDateTime } from '#helpers/Common.js';
import { ORDER_EXPORT_HEADERS, buildExportOrderRow } from '#helpers/export.js';
import OrderLogs from '#models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#helpers/channelEngineErrorMessage.js';
import Channel from '../models/Channel.js';
import Seller from '../models/Seller.js';

const EXPORT_CHUNK_SIZE = parseInt(process.env.EXPORT_CHUNK_SIZE || '1000', 10); // Chunk size for CSV export processing

const formatOrder = async (order, channelImage, sellerId) => {
  let sellerName = '';
  let sellerObjectId = null;

  if (sellerId) {
    sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;

    const seller = await Seller.findById(sellerObjectId, { name: 1, companyName: 1 }).lean();

    if (seller) {
      sellerName = seller.companyName || seller.name || '';
    }
  }

  // Filter SKUs seller-wise (if sellerId provided)
  const sellerSkus = sellerObjectId
    ? order.orderSkuList?.skuList?.filter((sku) => sku.sellerId?.toString() === sellerObjectId.toString()) || []
    : order.orderSkuList?.skuList || [];

  const totalQuantity = sellerSkus.reduce((sum, sku) => sum + (sku.quantity || 0), 0);

  const totalPrice = sellerSkus.reduce((sum, sku) => sum + (sku.originalLineTotalInclVat || 0), 0);

  const customer = `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim();
  let skuOrderId = null;

  if (sellerObjectId && sellerSkus.length > 0) {
    skuOrderId = sellerSkus[0].orderId;
  }

  return {
    _id: order._id,
    skuOrderId,
    //  Added seller details
    sellerId: sellerObjectId || null,
    sellerName,

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
      sortBy = 'orderDate',
      platform = '',
    } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    // Convert sellerId to ObjectId
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

    // Base match stage
    const filter = {
      sellerIds: { $in: [sellerObjectId] },
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
          ],
        };
      });
      appliedFilters.search = search;
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

    // Build aggregation pipeline
    const pipeline = [{ $match: filter }];

    if (status) {
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
      data: await Promise.all(
        orders.map((order) => {
          const matchingChannel = channelMap[order.channelId] || null;
          return formatOrder(order, matchingChannel, sellerObjectId);
        })
      ),
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

    let sellerObjectId = null;

    if (sellerId) {
      sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;
      filter.sellerIds = { $in: [sellerObjectId] };
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
      data: await Promise.all(
        orders.map((order) => {
          const matchingChannel = channelMap[order.channelId] || null;
          return formatOrder(order, matchingChannel, sellerId);
        })
      ),
      appliedFilters,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
};
export const getOrderById = async (id, sellerId) => {
  try {
    let sellerObjectId = null;
    let sellerName = '';

    // ---------------- OPTIONAL SELLER LOGIC ----------------
    if (sellerId) {
      sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;

      const seller = await Seller.findById(sellerObjectId, { name: 1, companyName: 1 }).lean();

      if (!seller) {
        throw new Error('Seller not found');
      }

      sellerName = seller.companyName || seller.name || '';
    }

    // ---------------- FETCH ORDER ----------------
    const order = await Order.findById(id).lean();
    if (!order) return false;

    // SECURITY CHECK – only if sellerId provided
    if (sellerObjectId) {
      if (!order.sellerIds?.some((s) => s.toString() === sellerObjectId.toString())) {
        throw new Error('Unauthorized access to this order');
      }
    }

    // ---------------- FILTER SKUS ----------------
    const allOrderSkus =
      order.orderSkuList?.skuList?.filter((sku) =>
        sellerObjectId ? sku.sellerId?.toString() === sellerObjectId.toString() : true
      ) || [];

    let sellerMap = {};

    if (!sellerObjectId) {
      // collect unique sellerIds
      const sellerIds = [
        ...new Set(
          allOrderSkus
            .map((s) => s.sellerId)
            .filter(Boolean)
            .map((id) => id.toString())
        ),
      ];

      const sellers = await Seller.find({ _id: { $in: sellerIds } }, { name: 1, companyName: 1 }).lean();

      sellerMap = sellers.reduce((acc, s) => {
        acc[s._id.toString()] = s.companyName || s.name || '';
        return acc;
      }, {});
    }

    // ---------------- FETCH SHIPMENTS ----------------
    const shipmentQuery = {
      orderId: id,
      type: 'FORWARD',
      status: { $ne: 'CANCELED' },
    };

    if (sellerObjectId) {
      shipmentQuery.sellerId = sellerObjectId;
    }

    const shipments = await Shipment.find(shipmentQuery).lean();

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

      // const dynamicSellerName = sellerName || sku.sellerName || '';
      const dynamicSellerName = sellerObjectId ? sellerName : sellerMap[sku.sellerId?.toString()] || '';
      // CANCELLED
      if (b.canceled > 0) {
        cancelledItems.push({
          id: sku.id,
          skuOrderId: sku.orderId,
          merchantProductNo: sku.merchantProductNo,
          channelProductNo: sku.channelProductNo,
          name: sku.description,
          imageUrl: image,
          quantity: b.canceled,
          status: 'CANCELED',
          hsCode,
          sellerId: sku.sellerId,
          sellerName: dynamicSellerName,
        });
      }

      // ---------- UNSHIPPED (CONFIRMED + SHIPMENT CREATED) ----------
      const pendingQty = b.confirmed || 0;

      if (pendingQty > 0) {
        unshippedItems.push({
          id: sku.id,
          skuOrderId: sku.orderId,
          merchantProductNo: sku.merchantProductNo,
          channelProductNo: sku.channelProductNo,
          name: sku.description,
          imageUrl: image,
          quantity: pendingQty,
          status: sku.status,
          hsCode,
          sellerId: sku.sellerId,
          sellerName: dynamicSellerName,
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

            const dynamicSellerName = sellerName || sku?.sellerName || '';

            return {
              id: sku?.id,
              skuOrderId: sku?.orderId || null,
              sellerName: dynamicSellerName,
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

    const filteredData = transformOrderResponse(order, allOrderSkus);
    let orderLogsDetails;

    const filter = { orderId: id };

    if (sellerObjectId) {
      filter.sellerId = sellerObjectId;
    }

    orderLogsDetails = await OrderLogs.findOne(filter).lean();

    const orderLogsData = orderLogsDetails?.details?.length ? formatOrderTrackingInf(orderLogsDetails.details) : [];
    const productsStatusDetails = allOrderSkus.map((sku) => {
      const b = sku.statusBreakdown || {};
      const dynamicSellerName = sellerName || sku.sellerName || '';

      return {
        id: sku.id,
        skuOrderId: sku.orderId,
        productCode: sku.merchantProductNo,
        totalQty: sku.quantity,
        confirmed: b.confirmed || 0,
        shipmentCreated: b.shipmentCreated || 0,
        shipped: b.shipped || 0,
        delivered: b.delivered || 0,
        returned: b.returned || 0,
        canceled: b.canceled || 0,
        sellerId: sku.sellerId,
        sellerName: dynamicSellerName,
      };
    });

    let skuOrderId = null;

    if (sellerObjectId) {
      // Seller specific → all SKUs same seller
      skuOrderId = allOrderSkus?.[0]?.orderId || null;
    }
    return {
      ...filteredData,
      sellerName: sellerObjectId ? sellerName : null,
      sellerId,
      skuOrderId,
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
    const sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;
    const counts = await Promise.all(
      statuses.map((status) =>
        Order.countDocuments({
          status,
          sellerIds: [sellerObjectId], // matches inside array automatically
        })
      )
    );
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
    const operations = await orderhelper.sanitizeOrdersData(orders, sellerId);
    const result = await Order.bulkWrite(operations);
    // Get only newly created (upserted) orders
    const upsertedOrderIds = Object.values(result.upsertedIds || {});
    const upsertedIndexes = Object.keys(result.upsertedIds || {}).map((i) => parseInt(i));

    const orderLogs = [];

    for (let i = 0; i < upsertedIndexes.length; i++) {
      const index = upsertedIndexes[i];
      const order = orders[index];
      const orderId = upsertedOrderIds[i];
      const latestOrderData = await Order.findOne({ _id: orderId }, { _id: 1, orderId: 1, sellerIds: 1 }).lean();
      const logDetails = [
        {
          status: 'CREATED',
          description: 'Order Placed',
          createdAt: new Date(order?.OrderDate || order?.orderDate || Date.now()),
        },
      ];

      //  IMPORTANT: create log per seller
      const sellerIds = latestOrderData?.sellerIds?.length ? latestOrderData.sellerIds : [sellerId]; // fallback if single seller

      for (const sId of sellerIds) {
        orderLogs.push({
          orderId,
          sellerId: sId,
          details: logDetails,
        });
      }
    }

    if (orderLogs.length > 0) {
      await OrderLogs.insertMany(orderLogs, { ordered: false });
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

    while (hasMore && page <= 3) {
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

const transformOrderResponse = (response, allOrderSkus = []) => {
  if (!response) return null;

  const data = response;

  // ---- Calculate totals from SKUs ----
  const totals = allOrderSkus.reduce(
    (acc, sku) => {
      const shippableQty = (sku.quantity || 0) - (sku.cancellationRequestedQuantity || 0);

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
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,

    shippingFee: data.shippingCostsInclVat || 0,
  };
};

const cancelFullOrder = async (orderId, order, sellerId, reason = 'NA') => {
  try {
    // Filter SKUs for this seller
    const sellerSkus = order.orderSkuList.skuList.filter((sku) => sku.sellerId.toString() === sellerId.toString());

    if (!sellerSkus.length) {
      return {
        success: false,
        error: { message: 'No SKUs found for this seller', status: 400 },
      };
    }

    // Prepare ChannelEngine cancellation lines
    const lines = sellerSkus
      .map((item) => ({
        MerchantProductNo: item.merchantProductNo,
        OrderLineId: item.id,
        Quantity: Math.max(0, parseInt(item.quantity) - parseInt(item.cancellationRequestedQuantity || 0)),
      }))
      .filter((line) => line.Quantity > 0);

    if (!lines.length) {
      return {
        success: false,
        error: { message: 'Nothing to cancel', status: 400 },
      };
    }

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
      sellerId,
      status: { $in: ['SHIPPED', 'DELIVERED'] },
    }).lean();

    if (shippedShipments.length > 0) {
      return {
        success: false,
        error: {
          message: 'Seller shipment already shipped, cannot cancel',
          status: 400,
        },
      };
    }

    // Cancel seller shipments
    const shipments = await Shipment.find({
      orderId,
      sellerId,
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

    // Update only seller SKUs
    await Order.updateOne({ _id: orderId }, [
      {
        $set: {
          'orderSkuList.skuList': {
            $map: {
              input: '$orderSkuList.skuList',
              as: 'sku',
              in: {
                $cond: [
                  { $eq: ['$$sku.sellerId', new mongoose.Types.ObjectId(sellerId)] },
                  {
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
                  '$$sku',
                ],
              },
            },
          },
        },
      },
    ]);

    const updatedOrder = await Order.findById(orderId);

    // Check if all SKUs are canceled
    const allCancelled = updatedOrder.orderSkuList.skuList.every((sku) => sku.status === ORDER_STATUS_MAP.CANCELED);

    if (allCancelled) {
      updatedOrder.status = ORDER_STATUS_MAP.CANCELED;
      await updatedOrder.save();
    }

    // ORDER LOG
    const logEntry = {
      status: 'CANCELED',
      description: `Seller ${sellerId} canceled items`,
      createdAt: new Date(),
    };

    const sellerIds = order.sellerIds || [];

    const bulkOps = sellerIds.map((sId) => ({
      updateOne: {
        filter: { orderId, sellerId: sId },
        update: { $push: { details: logEntry } },
        upsert: true,
      },
    }));

    await OrderLogs.bulkWrite(bulkOps);
    return { success: true, data: updatedOrder.toObject() };
  } catch (error) {
    console.error('cancelFullOrder error:', error);

    return {
      success: false,
      error: { message: error.message },
    };
  }
};

export const cancelPartialOrder = async (orderId, products, reason = 'NA', sellerId) => {
  try {
    // ----------------------------------------------------
    // FETCH ORDER
    // ----------------------------------------------------

    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
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

      const sellerSkus = order.orderSkuList.skuList.filter(
        (sku) => sku.sellerId.toString() === sellerObjectId.toString()
      );
      const sku = sellerSkus.find((s) => s.id.toString() === lineId);
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
      const cancelItem = products.find((p) => p.orderLineId.toString() === lineId);

      const shippedQty = shippedQtyMap[lineId] || 0;
      const deliveredQty = deliveredQtyMap[lineId] || 0;
      const shipmentCreatedQty = sku?.statusBreakdown?.shipmentCreated || 0;
      const prevCanceled = sku.cancellationRequestedQuantity || 0;
      const newlyCanceled = cancelItem ? cancelItem.quantity : 0;

      const canceledQty = prevCanceled + newlyCanceled;

      const confirmedQty = sku.quantity - canceledQty - shippedQty - deliveredQty - shipmentCreatedQty;

      return {
        ...sku,
        status: canceledQty === sku.quantity ? ORDER_STATUS_MAP.CANCELED : ORDER_STATUS_MAP.IN_PROGRESS,

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
      { orderId, sellerId: sellerObjectId },
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
    if (!sellerId) {
      return { success: false, message: 'Seller ID is required for export' };
    }

    const { status, platform, search, size = 100000, sortBy = 'orderDate', sortOrder = 'desc' } = filters;

    const filter = {
      sellerIds: { $in: [sellerId] },
    };

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
    }

    if (status) {
      const statusArray = status.split(',').map((s) => s.trim().toUpperCase());
      filter.status = { $in: statusArray };
    }

    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const headers = ORDER_EXPORT_HEADERS;
    const csvRows = [headers.join(',')];

    let processed = 0;
    let skip = 0;

    while (processed < size) {
      const orders = await Order.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Math.min(EXPORT_CHUNK_SIZE, size - processed))
        .lean();

      if (!orders.length) break;

      for (const order of orders) {
        /*
        FILTER SELLER SKUS
        */
        const sellerSkus = (order.orderSkuList?.skuList || []).filter(
          (sku) => String(sku.sellerId) === String(sellerId)
        );

        if (!sellerSkus.length) continue;

        /*
        CALCULATE SELLER TOTALS
        */
        const sellerTotals = {
          subTotalInclVat: sellerSkus.reduce((s, sku) => s + (sku.lineTotalInclVat || 0), 0),
          subTotalVat: sellerSkus.reduce((s, sku) => s + (sku.lineVat || 0), 0),
        };

        sellerTotals.totalInclVat = sellerTotals.subTotalInclVat;
        sellerTotals.totalVat = sellerTotals.subTotalVat;
        sellerTotals.subTotalExclVat = sellerTotals.subTotalInclVat - sellerTotals.subTotalVat;
        sellerTotals.totalExclVat = sellerTotals.subTotalExclVat;

        /*
        CREATE ROW PER SKU
        */
        for (let i = 0; i < sellerSkus.length; i++) {
          const sku = sellerSkus[i];

          const rowObject = buildExportOrderRow(order, sku, sellerTotals);

          /*
          SHOW ORDERID ONLY FIRST ROW
          */
          if (i > 0) {
            rowObject.orderId = '';
          }

          const row = headers.map((header) => {
            const value = rowObject?.[header];
            const safeValue = value === null || value === undefined ? '' : String(value).replace(/"/g, '""');

            return `"${safeValue}"`;
          });

          csvRows.push(row.join(','));
        }
      }

      processed += orders.length;
      skip += orders.length;
    }

    if (csvRows.length === 1) {
      return { success: false, message: 'No orders found' };
    }

    const sanitizedSellerName = sellerName.replace(/[^a-zA-Z0-9]/g, '');
    const exportDate = new Date().toISOString().split('T')[0];
    const filename = `${sanitizedSellerName}_OrderExport_${exportDate}.csv`;

    return {
      success: true,
      filename,
      data: csvRows.join('\n'),
      count: csvRows.length - 1,
    };
  } catch (error) {
    console.error('Error exporting orders:', error.message);
    throw error;
  }
};
export const addOrderLog = async (orderId, sellerId, log) => {
  await OrderLogs.updateOne(
    { orderId, sellerId },
    {
      $push: { details: log },
      $setOnInsert: { orderId, sellerId },
    },
    { upsert: true }
  );
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
