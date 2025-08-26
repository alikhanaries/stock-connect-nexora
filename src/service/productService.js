import Product from '#models/Product.js';
import '#models/Category.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const fetchProducts = async (query) => {
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = {};
  const appliedFilters = {};

  // Status filter
  if (status !== undefined) {
    const statusBool = status.toString().toLowerCase() === 'true';
    filter.status = statusBool;
    appliedFilters.status = statusBool;
  }

  // Price filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) ((filter.price.$gte = Number(minPrice)), (appliedFilters.minPrice = Number(minPrice)));
    if (maxPrice) ((filter.price.$lte = Number(maxPrice)), (appliedFilters.maxPrice = Number(maxPrice)));
  }

  // Search filter
  // if (search) filter.$text = { $search: search };
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
  }
  // Sorting
  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  // Fetch total and products in parallel
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select('_id name status productSkuCode price msrp images currentStockCount createdAt categories')
      .populate('categories', '_id name slug')
      .lean(),
  ]);

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

export default { fetchProducts };
