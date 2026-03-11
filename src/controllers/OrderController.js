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
import { syncAmazonOrders } from '../service/amazonOrderService.js';
import { config } from '../config/config.js';

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
    return Responses.errorResponse(res, error, 500);
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
  try {
    const sellerId = req.sellerId;
    const userId = req.user._id;
    // TODO : Move this to service layer
    const { success, data } = await orderService.getNewOrders();
    if (!success) {
      return Responses.errorResponse(res, req?.locale?.NO_ORDERS_FOUND, 200);
    }
    if (data.length === 0) {
      return Responses.successResponse(res, req?.locale?.ALREADY_UP_TO_DATE, 200, []);
    }

    const [dataSavedInDb, response, amazonResponse] = await Promise.allSettled([
      orderService.processOrders(data, sellerId),
      config.IS_OCP_ORDER_SYNC_ENABLED
        ? getSyncedOrdersOcp(sellerId)
        : Promise.resolve({ success: true, message: 'OCP order sync is disabled' }),
      syncAmazonOrders(sellerId, req.locale, req.user._id),
    ]);

    // Check for rejected promises or failed results
    const isChannelEngineSuccess = dataSavedInDb.status === 'fulfilled' && dataSavedInDb.value?.success;
    const isOcpSuccess = response.status === 'fulfilled' && response.value?.success;
    const isAmazonSuccess = amazonResponse.status === 'fulfilled' && amazonResponse.value?.success;

    if (!isChannelEngineSuccess && !isOcpSuccess && !isAmazonSuccess) {
      const errorMessages = [
        dataSavedInDb.status === 'rejected' ? dataSavedInDb.reason?.message : dataSavedInDb.value?.message,
        response.status === 'rejected' ? response.reason?.message : response.value?.message,
        amazonResponse.status === 'rejected' ? amazonResponse.reason?.message : amazonResponse.value?.message,
      ]
        .filter(Boolean)
        .join('; ');

      return Responses.errorResponse(res, errorMessages || 'All sync operations failed', 500);
    }

    const newUpdateCount =
      ((dataSavedInDb.status === 'fulfilled' && dataSavedInDb.value?.data?.upsertedCount) || 0) +
      ((response.status === 'fulfilled' && response.value?.data?.upsertedCount) || 0) +
      ((amazonResponse.status === 'fulfilled' && amazonResponse.value?.data?.newUpdateCount) || 0);

    await updateSyncDate(sellerId, 'ORDER', newUpdateCount);

    const message =
      newUpdateCount > 0
        ? `${newUpdateCount} ${req?.locale?.NEW_ORDERS_SYNCED_SUCCESSFULLY}`
        : req?.locale?.NO_NEW_ORDERS_FOUND;

    const newOrdersToAcknowledge = data.filter((order) => order.Status === 'NEW' || !order.MerchantOrderNo);
    if (newOrdersToAcknowledge.length > 0) {
      orderService.backgroundAcknowledgementOrders(newOrdersToAcknowledge);
    }
    shipmentService
      ?.getChannelEngineShipmentDetailsService(userId)
      .then(() => {
        console.log(' ChannelEngine shipment sync completed successfully');
      })
      .catch((error) => {
        console.error(' ChannelEngine shipment sync failed:', error);
      });
    return Responses.successResponse(res, message, 200);
  } catch (error) {
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

    const { status, platform, search, size, sortBy, sortOrder } = req.query;

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
      ...(size && { size }),
      ...(sortBy && { sortBy }),
      ...(sortOrder && { sortOrder }),
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
