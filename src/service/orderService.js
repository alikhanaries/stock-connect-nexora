import Order from '#models/Orders.js';
import mongoose from 'mongoose';
import { upsertSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { ORDER_STATUS_MAP, SELECTED_FIELDS, BLOCKED_STATUSES } from '#constants/common.js';
import orderhelper from '#helpers/Order.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { randomBytes } from 'node:crypto';
import Shipment from '../models/Shipment/Shipment.js';
import Product from '../models/Product.js';
import SellerOrder from '#models/OrderSchema/SellerOrder.js';
import { cancelAymakanShipment, createAymakanDocumentId } from '#service/aymakanService.js';
import { formatShipmentTrackingInfo } from '#service/shipmentService.js';
import { ORDER_EXPORT_HEADERS, buildExportOrderRow } from '#helpers/export.js';
import { formatDateTime, truncate, resolveDateRange } from '#helpers/Common.js';
import OrderLogs from '#models/OrderLogs.js';
import { cancelChanelEngineCustomErrorMessage } from '#helpers/channelEngineErrorMessage.js';
import Channel from '../models/Channel.js';
import Seller from '../models/Seller.js';
import fs from 'fs';
import path from 'path';
import { syncSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';

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
    _id: order?.orderData?._id,
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
      channel,
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

    // ---------------- CHANNEL FILTER ----------------
    if (channel) {
      const channelNames = []
        .concat(channel)
        .flatMap((val) => (typeof val === 'string' ? val.split(',') : val))
        .map((c) => String(c).trim())
        .filter(Boolean);

      const regexArray = channelNames.map((name) => ({
        channelName: { $regex: name, $options: 'i' },
      }));

      const matchedChannels = await Channel.find({ $or: regexArray }).select('channelId').lean();

      const channelIds = matchedChannels.map((c) => c.channelId);

      if (channelIds.length === 1) {
        filter.channelId = channelIds[0];
      } else if (channelIds.length > 1) {
        filter.channelId = { $in: channelIds };
      } else {
        //  No match → force empty result
        filter.channelId = { $in: [] };
      }
      appliedFilters.channel = channel;
    }

    // ---------------- DATE FILTER ----------------
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

    // ---------------- STATUS FILTER ----------------
    if (status !== undefined && status !== null) {
      const statusArray = []
        .concat(status)
        .flatMap((s) => (typeof s === 'string' ? s.split(',') : s))
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean);

      filter.status = statusArray.length === 1 ? statusArray[0] : { $in: statusArray };

      appliedFilters.status = status;
    }

    // ---------------- SEARCH ----------------
    let searchMatchStage = null;

    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/);

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const conditions = words.map((word) => {
        const safeWord = escapeRegex(word);

        const regex = {
          $regex: safeWord,
          $options: 'i',
        };

        return {
          $or: [
            // SellerOrder fields
            { orderId: regex },
            { sellerOrderId: regex },

            // Order fields (after lookup)
            { 'orderData.orderCustomer.email': regex },
            { 'orderData.orderCustomer.firstName': regex },
            { 'orderData.orderCustomer.lastName': regex },
            { 'orderData.channelOrderNumber': regex },
          ],
        };
      });

      searchMatchStage = { $match: { $and: conditions } };
    }

    // ---------------- PIPELINE ----------------
    const pipeline = [
      { $match: filter },

      // JOIN ORDER
      {
        $lookup: {
          from: 'channelengineorders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'orderData',
        },
      },
      {
        $unwind: {
          path: '$orderData',
          preserveNullAndEmptyArrays: true,
        },
      },

      //  APPLY SEARCH AFTER LOOKUP
      ...(searchMatchStage ? [searchMatchStage] : []),

      // MERGE DATA
      {
        $addFields: {
          mergedOrder: {
            $mergeObjects: ['$orderData', '$$ROOT'],
          },
        },
      },
      { $replaceRoot: { newRoot: '$mergedOrder' } },

      // SORT + PAGINATION
      { $sort: { [sortBy]: sortDirection } },
      { $skip: skip },
      { $limit: parseInt(size) },
    ];

    // ---------------- EXECUTION ----------------
    const [orders, allChannels, sellerSync] = await Promise.all([
      SellerOrder.aggregate(pipeline),

      Channel.find().select('_id channelId channelImageUrl'),
      Seller.findById(sellerId).select('-_id lastOrderSync'),
    ]);

    const totalCountResult = await SellerOrder.aggregate([
      { $match: filter },

      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'orderData',
        },
      },
      {
        $unwind: {
          path: '$orderData',
          preserveNullAndEmptyArrays: true,
        },
      },

      ...(searchMatchStage ? [searchMatchStage] : []),

      { $count: 'total' },
    ]);

    const totalOrders = totalCountResult[0]?.total || 0;

    // ---------------- CHANNEL MAP ----------------
    const channelMap = {};
    allChannels.forEach((channel) => {
      channelMap[channel.channelId] = channel.channelImageUrl;
    });

    // ---------------- RESPONSE ----------------
    return {
      data: await Promise.all(
        orders.map(async (order) => {
          const matchingChannel = channelMap[order.channelId] || null;

          const formatted = await formatOrder(order, matchingChannel, sellerObjectId);

          return {
            ...formatted,
            sellerOrderStatus: order.status || null,
          };
        })
      ),
      appliedFilters,
      latestOrderSyncDate: sellerSync?.lastOrderSync || null,
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

    // ---------------- SELLER FILTER ----------------
    if (sellerId) {
      sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;
      filter.sellerIds = { $in: [sellerObjectId] };
      appliedFilters.sellerId = sellerId;
    }

    // ---------------- CHANNEL FILTER ----------------
    if (channelId !== undefined && channelId !== null) {
      const ids = []
        .concat(channelId)
        .flatMap((val) => (typeof val === 'string' ? val.split(',') : val))
        .map((id) => Number(id))
        .filter((id) => !isNaN(id));

      if (ids.length === 1) {
        filter.channelId = ids[0];
      } else if (ids.length > 1) {
        filter.channelId = { $in: ids };
      }

      appliedFilters.channelId = channelId;
    }

    // ---------------- DATE FILTER ----------------
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate && !isNaN(Date.parse(fromDate))) {
        filter.createdAt.$gte = new Date(fromDate);
        appliedFilters.fromDate = fromDate;
      }
      if (toDate && !isNaN(Date.parse(toDate))) {
        filter.createdAt.$lte = new Date(toDate);
        appliedFilters.toDate = toDate;
      }
    }

    // ---------------- STATUS FILTER ----------------
    if (status !== undefined && status !== null) {
      const statusArray = []
        .concat(status)
        .flatMap((s) => (typeof s === 'string' ? s.split(',') : s))
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean);

      if (statusArray.length === 1) {
        filter.status = statusArray[0];
      } else if (statusArray.length > 1) {
        filter.status = { $in: statusArray };
      }

      appliedFilters.status = status;
    }

    // ---------------- SEARCH ----------------
    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/);

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const conditions = words.map((word) => {
        const safeWord = escapeRegex(word);

        const regex = {
          $regex: safeWord,
          $options: 'i',
        };

        return {
          $or: [
            { orderId: regex },
            { 'orderSkuList.skuList.description': regex },
            { 'orderCustomer.email': regex },
            { 'orderCustomer.firstName': regex },
            { 'orderCustomer.lastName': regex },
            { 'orderCustomer.phone': regex },
          ],
        };
      });

      filter.$and = conditions;
      appliedFilters.search = search;
    }

    // ---------------- SORT ----------------
    const allowedSortFields = ['orderId', 'createdAt', 'status'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'orderId';

    // ---------------- FETCH ----------------
    const [totalOrders, orders, allChannels] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(sizeNum)
        .sort({ [safeSortBy]: sortDirection })
        .collation({ locale: 'en_US', numericOrdering: true })
        .select(SELECTED_FIELDS)
        .lean(),
      Channel.find().select('_id channelId channelImageUrl'),
    ]);

    // ---------------- CHANNEL MAP ----------------
    const channelMap = {};
    allChannels.forEach((channel) => {
      channelMap[channel.channelId] = channel.channelImageUrl;
    });

    // ---------------- SELLER ORDER STATUS ----------------
    let sellerOrderStatusMap = {};

    if (sellerObjectId && orders.length) {
      const orderIds = orders.map((o) => o.orderId.toString());

      const sellerOrders = await SellerOrder.find(
        {
          orderId: { $in: orderIds },
          sellerId: sellerObjectId,
        },
        { sellerOrderId: 1, status: 1 }
      ).lean();

      sellerOrderStatusMap = sellerOrders.reduce((acc, so) => {
        const orderId = so.sellerOrderId.split('_')[0];
        acc[orderId] = so.status;
        return acc;
      }, {});
    }

    // ---------------- RESPONSE ----------------
    return {
      data: await Promise.all(
        orders.map(async (order) => {
          const matchingChannel = channelMap[order.channelId] || null;

          const formatted = await formatOrder(order, matchingChannel, sellerObjectId);

          return {
            ...formatted,
            sellerOrderStatus: sellerObjectId ? sellerOrderStatusMap[order.orderId.toString()] || null : null,
          };
        })
      ),
      appliedFilters,
      pagination: getPagination(totalOrders, pageNum, sizeNum),
    };
  } catch (err) {
    console.error('Error fetching admin orders:', err.message);
    return { success: false, message: err.message };
  }
};
export const getOrderById = async (id, sellerId) => {
  try {
    // ---------------- FETCH ORDER ----------------
    const order = await Order.findById(id).lean();
    if (!order) return false;
    let sellerObjectId = null;
    let sellerName = '';
    let sellerOrderStatus = null;
    // ---------------- OPTIONAL SELLER LOGIC ----------------
    if (sellerId) {
      sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;

      const seller = await Seller.findById(sellerObjectId, { name: 1, companyName: 1 }).lean();

      if (!seller) {
        throw new Error('Seller not found');
      }

      sellerName = seller.companyName || seller.name || '';

      if (sellerObjectId) {
        // Single seller → direct lookup
        const sellerOrder = await SellerOrder.findOne(
          {
            orderId: order.orderId.toString(),
            sellerId: sellerObjectId,
          },
          { status: 1 }
        ).lean();

        sellerOrderStatus = sellerOrder?.status || null;
      }
    }

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
          documentId: sku.documentId,
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
        omnifulTrackingNo: shipment?.omniful?.trackingNo || null,
        shipmentMode: shipment.shipmentMethod || 'AYMAKAN',
        documentId: shipment.invoiceDocumentId ?? null,
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
              omnifulTrackingNo: shipment?.omniful?.trackingNo || null,
              hsCode: productsMap[p.merchantProductNo]?.hsCode || p.merchantProductNo,
              trackingInfo: formatShipmentTrackingInfo(shipment?.trackingInfo) || [],
              documentId: sku?.documentId,
            };
          }) || [],
      });
    });

    // ---------------- FINAL RESPONSE ----------------

    const filteredData = transformOrderResponse(order, allOrderSkus, sellerOrderStatus);
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
    const sellerObjectId = typeof sellerId === 'string' ? new mongoose.Types.ObjectId(sellerId) : sellerId;
    const statuses = Object.keys(ORDER_STATUS_MAP);
    //  Aggregation
    const result = await SellerOrder.aggregate([
      {
        $match: {
          sellerId: sellerObjectId,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    //  Initialize all statuses with 0
    const stats = {};
    statuses.forEach((status) => {
      stats[status] = 0;
    });

    //  Fill actual counts
    result.forEach((item) => {
      stats[item._id] = item.count;
    });

    //  Final API response
    return stats;
  } catch (error) {
    console.error('Error getting order stats:', error.message);
  }
};

export const processOrders = async (orders, sellerId) => {
  try {
    const { bulkOps, sellerOrderPayloads, pendingLogs } = await orderhelper.sanitizeOrdersData(orders, sellerId);

    const result = await Order.bulkWrite(bulkOps, { ordered: false });

    //  Now safe
    await Promise.all(sellerOrderPayloads.map((p) => upsertSellerOrdersFromOrder(p)));

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

    const orderLogsBulkOps = [];

    for (const log of orderLogs) {
      for (const detail of log.details) {
        orderLogsBulkOps.push({
          updateOne: {
            filter: {
              orderId: log.orderId,
              sellerId: log.sellerId,
            },
            update: {
              $addToSet: {
                details: {
                  status: detail.status,
                  description: detail.description,
                  createdAt: detail.createdAt,
                },
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (orderLogsBulkOps.length) {
      await OrderLogs.bulkWrite(orderLogsBulkOps);
      console.log('Inserted order logs:', orderLogs.length);
    } else {
      console.log('No new orders created — skipping log insertion');
    }

    if (pendingLogs.length) {
      // 1 Fetch order _ids
      const insertedOrders = await Order.find({
        orderId: { $in: pendingLogs.map((l) => l.orderId) },
      }).select('_id orderId');

      const orderIdMap = new Map(insertedOrders.map((o) => [String(o.orderId), o._id]));

      // 2️ Build bulk ops
      const orderLogsBulkOps = [];

      for (const log of pendingLogs) {
        const orderObjectId = orderIdMap.get(String(log.orderId));
        if (!orderObjectId) continue;

        orderLogsBulkOps.push({
          updateOne: {
            filter: {
              orderId: orderObjectId,
              sellerId: log.sellerId,
            },
            update: {
              $push: {
                details: {
                  status: log.status,
                  description: log.description,
                  createdAt: log.createdAt,
                },
              },
              $setOnInsert: {
                orderId: orderObjectId,
                sellerId: log.sellerId,
              },
            },
            upsert: true,
          },
        });
      }

      // 3️ Execute
      if (orderLogsBulkOps.length) {
        await OrderLogs.bulkWrite(orderLogsBulkOps);
      }
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

    while (hasMore && page <= 55) {
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

const transformOrderResponse = (response, allOrderSkus = [], sellerOrderStatus) => {
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
    status: sellerOrderStatus,

    // Calculated values
    subtotal: truncate(totals.subtotal),
    tax: truncate(totals.tax),
    total: truncate(totals.total),

    shippingFee: Number(data.shippingCostsInclVat) || 0,
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
                        cancellationRequestedQuantity: '$$sku.quantity', // ✅ mark all remaining qty as cancelled
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
      description: `Canceled all items`,
      createdAt: new Date(),
    };

    await OrderLogs.updateOne(
      { orderId, sellerId: sellerId },
      {
        $push: {
          details: logEntry,
        },
      },
      { upsert: true }
    );
    await syncSellerOrdersFromOrder(orderId);
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
    const sellerSkus = order.orderSkuList.skuList.filter(
      (sku) => sku.sellerId.toString() === sellerObjectId.toString()
    );

    // ----------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------
    for (const item of products) {
      const lineId = item.orderLineId.toString();

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

      // check if this SKU belongs to payload seller
      if (sku.sellerId.toString() !== sellerObjectId.toString()) {
        return sku;
      }

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
      { orderId, sellerId: sellerObjectId },
      {
        $push: {
          details: {
            status: orderStatus,
            description: `Canceled: ${products.map((p) => `${p.merchantProductNo} x ${p.quantity}`).join(', ')}`,
            createdAt: new Date(),
          },
        },
      },
      { upsert: true }
    );
    await syncSellerOrdersFromOrder(orderId);
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

    const { status, search, sortBy = 'orderDate', sortOrder = 'desc', channel } = filters;

    let allowedOrderIdsByStatus = null;

    if (status !== undefined && status !== null) {
      const statusArray = []
        .concat(status)
        .flatMap((s) => (typeof s === 'string' ? s.split(',') : s))
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean);

      const sellerOrdersByStatus = await SellerOrder.find(
        {
          sellerId: String(sellerId),
          status: statusArray.length === 1 ? statusArray[0] : { $in: statusArray },
        },
        { orderId: 1 }
      ).lean();

      allowedOrderIdsByStatus = new Set(sellerOrdersByStatus.map((so) => so.orderId));

      if (!allowedOrderIdsByStatus.size) {
        return { success: false, message: 'No orders found' };
      }
    }

    const filter = {
      sellerIds: { $in: [sellerId] },
      'orderSkuList.skuList.sellerId': sellerId,
    };

    if (allowedOrderIdsByStatus) {
      filter.orderId = { $in: [...allowedOrderIdsByStatus] };
    }

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
      const channelNames = channel
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const regexArray = channelNames.map((name) => ({
        channelName: { $regex: name, $options: 'i' },
      }));

      const matchedChannels = await Channel.find({ $or: regexArray }).select('channelId').lean();

      const channelIds = matchedChannels.map((c) => c.channelId);

      //  If no channel matched → return empty
      if (!channelIds.length) {
        return { success: false, message: 'No orders found' };
      }

      //  Apply filter
      filter.channelId = channelIds.length === 1 ? channelIds[0] : { $in: channelIds };
    }

    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const orders = await Order.find(filter).sort(sort).lean();

    if (!orders.length) {
      return { success: false, message: 'No orders found' };
    }
    const orderObjectIds = orders.map((o) => o._id);

    const shipments = await Shipment.find({
      orderId: { $in: orderObjectIds },
    }).lean();

    const airwaybillMap = {};

    shipments.forEach((shipment) => {
      const orderIdStr = String(shipment.orderId);

      (shipment.products || []).forEach((product) => {
        if (!product?.merchantProductNo) return;

        const key = `${orderIdStr}_${product.merchantProductNo}`;

        if (!airwaybillMap[key]) airwaybillMap[key] = [];

        if (shipment.airWaybillNo) {
          airwaybillMap[key].push(shipment.airWaybillNo);
        }
      });
    });

    const sellerOrderIds = [...new Set(orders.map((i) => i.orderId))];

    const sellerOrders = await SellerOrder.find(
      {
        orderId: { $in: sellerOrderIds },
        sellerId: String(sellerId),
      },
      { status: 1, orderId: 1 }
    ).lean();

    const sellerOrderStatusMap = sellerOrders.reduce((acc, so) => {
      acc[so.orderId] = so.status;
      return acc;
    }, {});

    const headers = ORDER_EXPORT_HEADERS;
    const csvRows = [headers.join(',')];

    for (const order of orders) {
      const sellerOrderStatus = sellerOrderStatusMap[order.orderId?.toString()] || 'NA';

      const sellerSkus = (order.orderSkuList?.skuList || []).filter((sku) => String(sku.sellerId) === String(sellerId));

      if (!sellerSkus.length) continue;

      const totalSkuCount = sellerSkus.length;

      const sellerTotals = sellerSkus.reduce(
        (totals, sku) => {
          const cancelledQty = sku.cancellationRequestedQuantity || 0;
          const effectiveQty = Math.max((sku.quantity || 0) - cancelledQty, 0);

          const unitPriceInclVat = sku.unitPriceInclVat || 0;
          const unitVat = sku.unitVat || 0;

          totals.subTotalInclVat += unitPriceInclVat * effectiveQty;
          totals.subTotalVat += unitVat * effectiveQty;

          return totals;
        },
        { subTotalInclVat: 0, subTotalVat: 0 }
      );

      sellerTotals.totalInclVat = sellerTotals.subTotalInclVat;
      sellerTotals.totalVat = sellerTotals.subTotalVat;
      sellerTotals.subTotalExclVat = sellerTotals.subTotalInclVat - sellerTotals.subTotalVat;
      sellerTotals.totalExclVat = sellerTotals.subTotalExclVat;

      for (let i = 0; i < sellerSkus.length; i++) {
        const sku = sellerSkus[i];

        const key = `${order._id}_${sku.merchantProductNo}`;
        const airwaybillNumber = (airwaybillMap[key] || []).join('|');

        const rowObject = buildExportOrderRow(
          {
            ...order,
            status: sellerOrderStatus,
          },
          {
            ...sku,
            airwaybillNumber,
          },
          sellerTotals,
          sellerId,
          totalSkuCount,
          sellerOrderStatus
        );

        if (i > 0) {
          rowObject.orderId = '';
          rowObject.orderSkuListCount = '';
        }

        const row = headers.map((header) => {
          const value = rowObject?.[header];
          const safeValue = value === null || value === undefined ? '' : String(value).replace(/"/g, '""');

          return `"${safeValue}"`;
        });

        csvRows.push(row.join(','));
      }
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

export const generateDocumentId = async ({ orderId, skuCodes, file }) => {
  // Normalize from-data inputs
  const normalizedOrderId = String(orderId)
    .replace(/^"+|"+$/g, '')
    .trim();
  const normalizedSkuCodes = Array.isArray(skuCodes)
    ? skuCodes.map((s) =>
        String(s)
          .replace(/^"+|"+$/g, '')
          .trim()
      )
    : [
        String(skuCodes)
          .replace(/^"+|"+$/g, '')
          .trim(),
      ];

  // Find the order
  const order = await Order.findOne({ orderId: normalizedOrderId });
  if (!order) throw new Error(`Order not found: ${normalizedOrderId}`);

  // Check all requested SKUs exist
  const skuList = order.orderSkuList?.skuList || [];
  const missingSkus = normalizedSkuCodes.filter((sku) => !skuList.some((item) => item.merchantProductNo === sku));
  if (missingSkus.length > 0) {
    throw new Error(`The following SKU(s) are not in the order: ${missingSkus.join(', ')}`);
  }

  // Convert file to base64
  const fileBuffer = await fs.promises.readFile(file.path);
  const base64String = fileBuffer.toString('base64');
  const ext = path.extname(file.originalname).slice(1);

  const payload = {
    document: base64String,
    document_type: ext,
    reference: '',
  };

  // Aymakan API
  const result = await createAymakanDocumentId(payload);
  const documentId = result.data.document_id;

  skuList.forEach((skuItem) => {
    if (normalizedSkuCodes.includes(skuItem.merchantProductNo)) {
      skuItem.documentId = documentId;
    }
  });

  await order.save();
  return documentId;
};
const getAnalyticsOrders = async (query) => {
  try {
    const {
      page = 1,
      size = 10,
      search,
      status = [],
      sortOrder = 'desc',
      sortBy = 'orderDate',
      sellerId = [],
      channel = [],
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

    if (sellerId.length) {
      sellerObjectIds = sellerId.map((id) => new mongoose.Types.ObjectId(id));
    }

    // -------------------------
    // CHANNEL FILTER
    // -------------------------
    if (channel.length) {
      filter.channelName = {
        $in: channel.map((ch) => new RegExp(escapeRegex(ch), 'i')),
      };
      appliedFilters.channel = channel;
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
    // STATUS HANDLING (FIXED)
    // -------------------------
    let statusMatchStage = null;

    // -------------------------
    // STATUS HANDLING (FIXED)
    // -------------------------
    if (status.length) {
      const statusArray = status.map((s) => s.toUpperCase());

      const validStatuses = Object.values(ORDER_STATUS_MAP);

      const invalid = statusArray.filter((s) => !validStatuses.includes(s));

      if (invalid.length) {
        throw new Error(`Invalid status: ${invalid.join(', ')}. Valid statuses are: ${validStatuses.join(', ')}`);
      }

      // Map DELIVERED → CLOSED
      const mappedStatuses = statusArray.map((s) => (s === 'DELIVERED' ? 'CLOSED' : s));

      // Remove duplicates (important if both CLOSED + DELIVERED passed)
      const uniqueStatuses = [...new Set(mappedStatuses)];

      // Apply filter
      filter.status = {
        $in: uniqueStatuses.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')),
      };

      // Applied filters (clean output)
      appliedFilters.status = status.map((s) => s.toLowerCase());
    }

    // -------------------------
    // BASE PIPELINE
    // -------------------------
    let pipeline = [{ $match: filter }];

    // -------------------------
    // SELLER LOOKUP
    // -------------------------
    pipeline.push(
      {
        $lookup: {
          from: 'sellers',
          localField: 'sellerId',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: '$seller' },
      {
        $match: {
          'seller.isDeleted': false,
          'seller.type': 'normal',
        },
      }
    );

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
    // APPLY STATUS FILTER
    // -------------------------
    if (statusMatchStage) {
      pipeline.push(statusMatchStage);
    }

    // -------------------------
    // SORT + PAGINATION
    // -------------------------
    pipeline.push({ $sort: { [sortBy]: sortDirection } }, { $skip: skip }, { $limit: size });

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

    // -------------------------
    // CHANNEL MAP
    // -------------------------
    const channelMap = {};
    allChannels.forEach((c) => {
      channelMap[c.channelId] = c.channelImageUrl;
    });

    // -------------------------
    // LATEST SYNC DATE
    // -------------------------
    const latestOrderSyncDate = sellerSyncs.length
      ? sellerSyncs.reduce((max, s) => {
          if (!s.lastOrderSync) return max;
          return !max || s.lastOrderSync > max ? s.lastOrderSync : max;
        }, null)
      : null;

    // -------------------------
    // RESPONSE
    // -------------------------
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
    throw err;
  }
};

export const updateOrderSkuStatusToShipped = async (shipmentData) => {
  try {
    if (!shipmentData?.orderId || !shipmentData?.products?.length) {
      console.log(' Invalid shipmentData');
      return;
    }

    const sellerObjectId = new mongoose.Types.ObjectId(shipmentData.sellerId);

    //  Step 1: Fetch order
    const order = await Order.findOne({
      _id: shipmentData.orderId,
      sellerIds: { $in: [sellerObjectId] },
    });

    if (!order) {
      console.log(' Order not found');
      return;
    }

    const bulkOps = [];

    //  Step 2: Compute correct quantities
    shipmentData.products.forEach((product) => {
      order.orderSkuList?.skuList?.forEach((sku) => {
        if (
          sku.merchantProductNo === product.merchantProductNo &&
          sku.sellerId.toString() === sellerObjectId.toString()
        ) {
          const sb = sku.statusBreakdown || {};

          const shipmentCreated = sb.shipmentCreated || 0;
          const requestedQty = product.quantity || 0;

          const moveQty = Math.min(shipmentCreated, requestedQty);

          if (moveQty <= 0) {
            console.log(' Skip SKU (no qty to move):', product.merchantProductNo);
            return;
          }

          const filter = {
            _id: shipmentData.orderId,
          };

          const update = {
            $set: {
              'orderSkuList.skuList.$[elem].status': 'SHIPPED',
            },
            $inc: {
              'orderSkuList.skuList.$[elem].statusBreakdown.shipmentCreated': -moveQty,
              'orderSkuList.skuList.$[elem].statusBreakdown.shipped': moveQty,
            },
          };

          const arrayFilters = [
            {
              'elem.merchantProductNo': product.merchantProductNo,
              'elem.sellerId': sellerObjectId,
            },
          ];

          bulkOps.push({
            updateOne: {
              filter,
              update,
              arrayFilters,
            },
          });
        }
      });
    });

    // Step 3: Execute bulk update
    if (bulkOps.length === 0) {
      return;
    }

    const result = await Order.bulkWrite(bulkOps);
    return result;
  } catch (error) {
    console.error(' Order SKU Update Error:', error);
    throw error;
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
  generateDocumentId,
  updateOrderSkuStatusToShipped,
};
