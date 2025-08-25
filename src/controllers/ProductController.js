import Product from '#models/Product.js';
import '#models/Category.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { getPagination } from '#helpers/PaginationHandler.js';

export const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Number(req.query.size) || 10);

    const [totalElements, products] = await Promise.all([
      Product.countDocuments(),
      Product.find()
        .skip((page - 1) * size)
        .limit(size)
        .select('_id name status productSkuCode price msrp images currentStockCount createdAt categories')
        .populate('categories', '_id name slug')
        .lean(),
    ]);
    const pagination = getPagination(totalElements, page, size);
    return res
      .status(200)
      .json(formatSuccessResponse({ content: products, ...pagination }, 'Products fetched successfully'));
  } catch (err) {
    console.error('Error fetching products:', err);
    return res.status(500).json(formatErrorResponse('Failed to fetch products', 500, { error: err.message }));
  }
};
