import Product from '#models/Product.js';
import '#models/Category.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const getProducts = async ({
  page = 1,
  size = 10,
  status,
  minPrice,
  maxPrice,
  search,
  sortBy = 'createdAt',
  sortOrder = 'desc',
}) => {
  page = Math.max(1, Number(page));
  size = Math.max(1, Number(size));

  const filter = {};

  if (status !== undefined) {
    if (status.toLowerCase() === 'true') filter.status = true;
    else if (status.toLowerCase() === 'false') filter.status = false;
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (search) {
    filter.$text = { $search: search };
  }

  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(sort)
      .skip((page - 1) * size)
      .limit(size)
      .select('_id name status productSkuCode price msrp images currentStockCount createdAt categories')
      .populate('categories', '_id name slug')
      .lean(),
  ]);

  return { products, pagination: getPagination(total, page, size) };
};
export default { getProducts };
