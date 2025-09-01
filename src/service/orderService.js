import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const formatOrder = (order) => {
  const totalQuantity = order.skus?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const customer = `${order.billingAddress?.firstName || ''} ${order.billingAddress?.lastName || ''}`.trim();

  return {
    orderID: order.orderId,
    quantity: totalQuantity,
    totalPrice: order.orderDetails?.totalInclVat || 0,
    customer,
    orderDate: order.orderDate,
    email: order.email,
    phoneNumber: order.phoneNumber,
    status: order.status,
    platform: order.channelName,
  };
};

const SELECTED_FIELDS = [
  'orderId',
  'billingAddress.firstName',
  'billingAddress.lastName',
  'skus.description',
  'status',
  'skus.quantity',
  'orderDetails.totalInclVat',
  'channelName',
  'orderDate',
  'email',
  'phoneNumber',
].join(' ');

const getAllOrders = async (query) => {
  try {
    const pageNumber = Math.max(parseInt(query.page) || 1, 1);
    const limit = Math.max(parseInt(query.size) || 10, 1);
    const skip = (pageNumber - 1) * limit;
    const sortDirection = query.sort === '-1' ? -1 : 1;
    const appliedFilters = {};

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(),
      Order.find().skip(skip).limit(limit).sort({ _id: sortDirection }).select(SELECTED_FIELDS).lean(),
    ]);

    return {
      data: orders.map(formatOrder),
      appliedFilters: appliedFilters,
      pagination: getPagination(totalOrders, pageNumber, limit),
    };
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return { success: false, message: err.message };
  }
};

const getOrderById = async (id) => {
  const order = await Order.findById(id).select(SELECTED_FIELDS).lean();
  if (!order) {
    return false;
  }
  const formattedOrder = formatOrder(order);
  return formattedOrder;
};

export default { getAllOrders, getOrderById };
