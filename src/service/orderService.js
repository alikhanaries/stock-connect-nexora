import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const formatOrder = (order) => {
  const totalQuantity = order.skus?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const customer = `${order.billingAddress?.firstName || ''} ${order.billingAddress?.lastName || ''}`.trim();

  // const skuNames = order.skus?.map((sku) => sku.description).filter(Boolean) ?? [];
  return {
    orderID: order.orderId,
    quantity: totalQuantity,
    totalPrice: order.orderDetails?.totalInclVat || 0,
    customer,
    email: order.email,
    status: order.status,
    platform: order.channelName,
    // skuName: skuNames,
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
  'createdAt',
  'email',
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
        { 'skus.description': regex },
        { email: regex },
        { 'billingAddress.firstName': regex },
        { 'billingAddress.lastName': regex },
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
      filter.status = status;
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

export default { getAllOrders };
