import Order from '#models/Order.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const getAllOrders = async (query) => {
  try {
    const { page = 1, size = 10, sort = 1 } = query;

    const pageNumber = parseInt(page);
    const limit = parseInt(size);
    const skip = (pageNumber - 1) * limit;
    const sortDirection = parseInt(sort);

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(),
      Order.find().skip(skip).limit(limit).sort({ _id: sortDirection }).lean(),
    ]);
    if (orders?.length === 0) {
      return {
        success: false,
      };
    }
    const paginatedOrders = getPagination(totalOrders, pageNumber, limit);

    return {
      success: true,
      content: orders,
      ...paginatedOrders,
    };
  } catch (err) {
    console.error('Error :', err.message);
    return { success: false, message: err.message };
  }
};

export default { getAllOrders };
