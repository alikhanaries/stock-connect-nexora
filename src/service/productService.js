import Product from '#models/Product.js';
import '#models/Category.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_KEY } = config;

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
  if (search) filter.$text = { $search: search };

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

export const pushProducts = async (products) => {
  try {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products),
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Error pushing products to ChannelEngine:', err);
    return {
      StatusCode: 500,
      Success: false,
      Message: err.message || 'Unexpected error occurred',
    };
  }
};

export default { fetchProducts, pushProducts };
