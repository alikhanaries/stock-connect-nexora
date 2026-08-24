import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';
import mongoose from 'mongoose';
import { errorLog } from '#middleware/index.js';
import { VALID_PERIODS, USER_ROLES } from '#constants/common.js';
import {
  cancelFullOrderOcp,
  cancelPartialOrderOcp,
  getSyncedOrdersOcp,
} from '../integrations/erp/ocp/services/orderServices.js';
import shipmentService from '../service/shipmentService.js';
import Order from '../models/Orders.js';
import Seller from '#models/Seller.js';
import { updateSyncDate } from '../helpers/updateSyncDate.js';
import { parseInvoiceDataForGenerateSellerInvoice } from '../helpers/ParseInvoice.js';
import { config } from '../config/config.js';
import { generateSellerInvoicePDF } from '#utils/generateInvoicePdf.js';
import omnifullService from '../service/omnifullService.js';
import { syncSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';

export const getAllOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { data, appliedFilters, pagination, latestOrderSyncDate } = await orderService.getAllOrders(
      req.query,
      sellerId
    );

    if (!data.length) {
      return Responses.successResponse(res, req.locale.NO_ORDERS_FOUND, 200, {
        content: [],
        appliedFilters: appliedFilters || {},
        latestOrderSyncDate,
        ...pagination,
      });
    }

    return Responses.successResponse(res, req?.locale?.ORDERS_FETCHED_SUCCESSFULLY, 200, {
      content: data,
      appliedFilters: appliedFilters || {},
      latestOrderSyncDate,
      ...pagination,
    });
  } catch (error) {
    console.error('Controller Error:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getAdminOrders = async (req, res) => {
  try {
    if (req.user.role !== USER_ROLES.MASTER_ADMIN) {
      return Responses.errorResponse(res, `User role ${req.user.role} is not authorized to access this route`, 403);
    }

    const { sellerId, channelId } = req.query;

    const { data, appliedFilters, pagination } = await orderService.getAdminOrders(req.query, sellerId, channelId);

    if (!data.length) {
      return Responses.successResponse(res, req.locale.NO_ORDERS_FOUND, 200, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return Responses.successResponse(res, req.locale.ORDERS_FETCHED_SUCCESSFULLY, 200, {
      content: data,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });
  } catch (error) {
    console.error('Admin Orders Controller Error:', error.message);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.sellerId;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return Responses.failResponse(res, 'Invalid sellerid', 400);
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }
    const order = await orderService.getOrderById(id, sellerId);
    if (!order) {
      return Responses.failResponse(res, req.locale.NO_ORDERS_FOUND, 404);
    }
    return Responses.successResponse(
      res,
      req?.locale?.ORDER_FETCHED_SUCCESSFULLY || 'Order Fetched Successfully',
      200,
      order
    );
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error?.message, 500);
  }
};

export const getOrderStats = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const stats = await orderService.getOrderStats(sellerId);
    if (!stats) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_ORDER_STATUS, 404);
    }
    return Responses.successResponse(res, req.locale.ORDER_STATUS_STATS_FETCHED_SUCCESSFULLY, 200, stats);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getSyncedOrders = async (req, res) => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const tag = `[order-sync][run=${runId}]`;
  try {
    const sellerId = req.sellerId;
    const userId = req.user._id;

    // TODO : Move this to service layer
    let success, data;
    try {
      ({ success, data } = await orderService.getNewOrders(tag));
    } catch (err) {
      console.error(`${tag} STEP 2/6 FAILED fetching orders from ChannelEngine:`, err);
      throw err;
    }
    if (!success) {
      console.error(`${tag} STEP 2/6 FAILED getNewOrders returned success=false`);
      return Responses.errorResponse(res, req?.locale?.NO_ORDERS_FOUND, 200);
    }
    if (data.length === 0) {
      return Responses.successResponse(res, req?.locale?.ALREADY_UP_TO_DATE, 200, []);
    }

    const runOcpSync = async () => {
      if (!config.IS_OCP_ORDER_SYNC_ENABLED) {
        return { success: true, message: 'OCP order sync is disabled' };
      }
      try {
        return await getSyncedOrdersOcp(sellerId);
      } catch (err) {
        console.error(`${tag} STEP 3/6 FAILED OCP sync:`, err);
        throw err;
      }
    };

    const [dataSavedInDb, response] = await Promise.allSettled([
      orderService.processOrders(data, sellerId, tag),
      runOcpSync(),
    ]);

    if (dataSavedInDb.status === 'rejected') {
      console.error(`${tag} STEP 3/6 processOrders (ChannelEngine) REJECTED:`, dataSavedInDb.reason);
    }
    if (response.status === 'rejected') {
      console.error(`${tag} STEP 3/6 runOcpSync REJECTED:`, response.reason);
    }

    // Check for rejected promises or failed results
    const isChannelEngineSuccess = dataSavedInDb.status === 'fulfilled' && dataSavedInDb.value?.success;
    const isOcpSuccess = response.status === 'fulfilled' && response.value?.success;

    if (!isChannelEngineSuccess && !isOcpSuccess) {
      const errorMessages = [
        dataSavedInDb.status === 'rejected' ? dataSavedInDb.reason?.message : dataSavedInDb.value?.message,
        response.status === 'rejected' ? response.reason?.message : response.value?.message,
      ]
        .filter(Boolean)
        .join('; ');

      console.error(`${tag} STEP 3/6 all sync operations failed: ${errorMessages}`);
      return Responses.errorResponse(res, errorMessages || 'All sync operations failed', 500);
    }

    const ceData = dataSavedInDb.status === 'fulfilled' ? dataSavedInDb.value?.data : null;
    const ocpUpserted = (response.status === 'fulfilled' && response.value?.data?.upsertedCount) || 0;
    const sellerSyncCount = (ceData?.sellerOrdersSynced || 0) + (ceData?.sellerOrdersBackfilledForSeller || 0);
    const globalSyncCount =
      (ceData?.upsertedCount || 0) + (ceData?.modifiedCount || 0) + (ceData?.sellerOrdersBackfilled || 0);
    const newUpdateCount = (sellerSyncCount > 0 ? sellerSyncCount : globalSyncCount) + ocpUpserted;

    await updateSyncDate(sellerId, 'ORDER', newUpdateCount);

    const message =
      newUpdateCount > 0
        ? `${newUpdateCount} ${req?.locale?.NEW_ORDERS_SYNCED_SUCCESSFULLY}`
        : req?.locale?.NO_NEW_ORDERS_FOUND;

    const processedOrderIds = new Set((ceData?.processedOrderIds || []).map(String));
    const newOrdersToAcknowledge = data.filter(
      (order) => (order.Status === 'NEW' || !order.MerchantOrderNo) && processedOrderIds.has(String(order.Id))
    );
    if (newOrdersToAcknowledge.length > 0) {
      orderService.backgroundAcknowledgementOrders(newOrdersToAcknowledge, tag);
    }
    shipmentService?.getChannelEngineShipmentDetailsService(userId).catch((error) => {
      console.error(`${tag} STEP 6/6 ChannelEngine shipment sync failed:`, error);
    });
    return Responses.successResponse(res, message, 200);
  } catch (error) {
    console.error(`${tag} FAILED:`, error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getOrderComparison = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period = 'week' } = req.query;
    const lowercasedPeriod = period.toLowerCase();

    if (!VALID_PERIODS.includes(lowercasedPeriod)) {
      return Responses.failResponse(res, `${req.locale.INVALID_PERIOD} ${VALID_PERIODS.join(', ')}`, 400);
    }

    const response = await orderService.getOrderComparison(lowercasedPeriod, sellerId);
    if (!response) {
      return Responses.failResponse(res, req.locale.ORDER_COMPARISON_CALC_FAILED, 404);
    }

    return Responses.successResponse(
      res,
      `${response.period} ${req.locale.ORDER_COMPARISON_FETCHED_SUCCESSFULLY}`,
      200,
      response
    );
  } catch (error) {
    console.error('Controller Error:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const merchantCancelById = async (req, res) => {
  try {
    const { orderId, reason, specifics } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }

    if (!reason) {
      return Responses.failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    const orderResponse = await orderService.cancelOrder(orderId, reason, specifics);

    if (!orderResponse.success) {
      return Responses.failResponse(res, orderResponse.error.message, orderResponse.error.status, orderResponse.error);
    }

    return Responses.successResponse(res, req.locale.CANCEL_ORDER, 200, orderResponse);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const cancelFullOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;
    const sellerId = req.sellerId;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return Responses.failResponse(res, req.locale.INVALID_SELLER_ID_FORMAT, 400);
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }

    if (!reason) {
      return Responses.failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    const order = await Order.findById(orderId)
      .select('orderSkuList orderId merchantOrderNo status sellerId channelName sellerIds')
      .lean();

    if (!order) return Responses.failResponse(res, 'Order not found', 404);
    if (order.status?.toUpperCase() === 'CANCELED') {
      return Responses.failResponse(res, 'Order is already canceled', 400);
    }
    let orderResponse;

    if (order.channelName === 'OCP') {
      orderResponse = await cancelFullOrderOcp(orderId, order, reason);
    } else {
      orderResponse = await orderService.cancelFullOrder(orderId, order, sellerId, reason);
    }

    if (!orderResponse.success) {
      return Responses.failResponse(
        res,
        orderResponse?.error?.message || orderResponse?.message,
        orderResponse?.error?.status || orderResponse?.status,
        null
      );
    }

    return Responses.successResponse(res, req?.locale?.CANCEL_ORDER || 'Order is cancelled', 200, null);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
export const cancelPartialOrder = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return Responses.failResponse(res, 'Seller id is missing', 404);
    const { orderId, reason, products } = req.body;

    const order = await Order.findById(orderId)
      .select('orderSkuList orderId merchantOrderNo status sellerIds channelName')
      .lean();

    if (!order) return Responses.failResponse(res, 'Order not found', 404);

    let orderResponse;

    if (order.channelName === 'OCP') {
      orderResponse = await cancelPartialOrderOcp(orderId, order, reason, products);
    } else {
      orderResponse = await orderService.cancelPartialOrder(orderId, products, reason, sellerId);
    }

    if (!orderResponse.success) {
      return Responses.failResponse(res, orderResponse.error.message, orderResponse.error.status, null);
    }

    return Responses.successResponse(res, 'Order is cancelled', 200, null);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

// Exports orders data as CSV file for a specific seller.
export const exportOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return Responses.failResponse(res, req.locale?.SELLER_ID_REQUIRED || 'Seller ID is required', 400);
    }

    const { status, platform, search, sortBy, sortOrder, channel } = req.query;

    // Fetch seller name for filename
    const seller = await Seller.findById(sellerId).select('name').lean();
    if (!seller) {
      return Responses.failResponse(res, req.locale?.SELLER_NOT_FOUND || 'Seller not found', 404);
    }

    /*
      BUILD FILTERS
    */
    const filters = {
      ...(status && { status }),
      ...(platform && { platform }),
      ...(search && { search }),
      ...(sortBy && { sortBy }),
      ...(sortOrder && { sortOrder }),
      ...(channel && { channel }),
    };

    /*
      EXPORT CSV
    */
    const result = await orderService.exportOrdersToCSV(sellerId, filters, seller.name);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale?.NO_ORDERS_FOUND || 'No orders found', 404);
    }
    // Set headers for CSV download with UTF-8 encoding
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Add UTF-8 BOM for proper encoding
    const csvWithBOM = '\uFEFF' + result.data;

    return res.status(200).send(csvWithBOM);
  } catch (error) {
    console.error('Controller Error: exportOrders:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const generateDocumentId = async (req, res) => {
  try {
    const orderId = req.body.orderId;
    const skuCodes = Array.isArray(req.body.skuCodes)
      ? req.body.skuCodes
      : req.body.skuCodes
        ? [req.body.skuCodes]
        : [];
    const file = req.file;
    const documentId = await orderService.generateDocumentId({
      orderId,
      skuCodes,
      file,
    });

    return Responses.successResponse(res, 'Document ID generated successfully', 200, { documentId });
  } catch (error) {
    console.error('Controller Error: generateDocumentId:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const handleOmnifulOrderWebhook = async (req, res) => {
  try {
    const { event_name, data } = req.body;
    if (!event_name || !data) {
      return Responses.failResponse(res, 'Invalid webhook structure', 400);
    }

    const result =
      event_name === 'purchase_order.update.event'
        ? await omnifullService.handleOmnifulPurchaseOrderReadyToShip(req.body)
        : await omnifullService.handleOmnifulOrdersWebhook(req.body);

    if (!result.success) {
      return Responses.failResponse(
        res,
        result.message || 'Failed to process Omniful webhook',
        result.statusCode || 400
      );
    }

    return Responses.successResponse(res, result.message || 'Order details updated successfully', 200, result.data);
  } catch (error) {
    console.error('Controller Error: handleOmnifulOrderWebhook:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getAnalyticsOrders = async (req, res) => {
  try {
    const query = req.validatedQuery;

    const { sellerId = [], channels = [], status = [], fromDate, toDate } = query;

    const finalQuery = {
      ...query,
      sellerId,
      channels: channels.includes('all') ? [] : channels,
      status,
      fromDate,
      toDate,
    };

    const {
      data = [],
      appliedFilters = {},
      pagination = {},
      latestOrderSyncDate = null,
    } = await orderService.getAnalyticsOrders(finalQuery);

    return Responses.successResponse(res, data.length ? 'Orders fetched successfully' : 'No orders found', 200, {
      content: data,
      appliedFilters,
      latestOrderSyncDate,
      ...pagination,
    });
  } catch (error) {
    console.error(' Controller Error:', error);
    errorLog(error);

    return Responses.errorResponse(res, error?.message || 'Something went wrong', 500);
  }
};

export const generateSellerInvoice = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const orderId = req.body.orderId;

    if (!sellerId) {
      return Responses.failResponse(res, req.locale?.SELLER_ID_REQUIRED || 'Seller ID is required', 400);
    }

    // Fetch seller name for filename
    const seller = await Seller.findById(sellerId).select('name').lean();
    if (!seller) {
      return Responses.failResponse(res, req.locale?.SELLER_NOT_FOUND || 'Seller not found', 404);
    }

    const result = await parseInvoiceDataForGenerateSellerInvoice(orderId, sellerId, seller);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale?.NO_ORDERS_FOUND || 'No orders found', 404);
    }

    // Invoice generation starts fulfillment → NEW becomes IN_PROGRESS
    const order = await Order.findOne({ orderId: String(orderId) });
    if (order?.status === 'NEW') {
      order.status = 'IN_PROGRESS';
      const skuList = order.orderSkuList?.skuList || [];
      skuList.forEach((sku) => {
        if (String(sku.sellerId) === String(sellerId)) {
          if ((sku.status || '').toUpperCase() === 'NEW' || !sku.status) {
            sku.status = 'IN_PROGRESS';
          }
        }
      });
      await order.save();
      await syncSellerOrdersFromOrder(order._id);
    }

    //  Generate PDF (UTIL CALL)
    return generateSellerInvoicePDF(res, result);
  } catch (error) {
    console.error('Controller Error: generateSellerInvoice:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
