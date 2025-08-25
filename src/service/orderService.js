import Order from '#models/Order.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const getAllOrders = async (req) => {
  try {
    const { page = 1, size = 10, sort = 'newest' } = req.query;

    const sortOrder = sort === 'newest' ? -1 : 1;

    const pageNumber = parseInt(page);
    const limit = parseInt(size);
    const skip = (pageNumber - 1) * limit;

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(),
      Order.find().skip(skip).limit(limit).sort({ createdAt: sortOrder }).lean(),
    ]);
    if (orders.length === 0) {
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
