import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const formatOrder = (order) => {
  const totalQuantity = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const totalPrice = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.lineVat || 0), 0) || 0;
  const customer = `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim();

  return {
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

const SELECTED_FIELDS = [
  'orderId',
  'orderCustomer.firstName',
  'orderCustomer.lastName',
  'orderCustomer.email',
  'orderCustomer.phone',
  'orderSkuList.skuList',
  'orderPaymentDetails.paymentMethod',
  'orderPaymentDetails.currencyCode',
  'status',
  'channelName',
  'orderDate',
  'createdAt',
].join(' ');

const getAllOrders = async (query) => {
  try {
    const { page = 1, size = 10, search, toDate, fromDate, status, sortOrder = 'asc', sortBy = '_id' } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    const filter = {};

    //search filter
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

    //date filter
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

    // status filter
    if (status) {
      filter.status = { $regex: new RegExp(`^${status}$`, 'i') };
      appliedFilters.status = status;
    }

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
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

const getOrderById = async (id) => {
  const order = await Order.findById(id).select(SELECTED_FIELDS).lean();
  if (!order) {
    return false;
  }
  const formattedOrder = formatOrder(order);
  return formattedOrder;
};

export default { getAllOrders, getOrderById };
