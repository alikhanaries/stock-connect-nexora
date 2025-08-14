import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import ImportList from '#models/ImportList.js';
import Product from '#models/Product.js';

export const addToImportList = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json(formatErrorResponse('No products selected for import', 400));
    }

    const docs = productIds.map((productId) => ({
      product: productId,
    }));

    await ImportList.insertMany(docs, { ordered: false });

    return res.status(200).json(formatSuccessResponse({}));
  } catch (err) {
    console.error('Error adding to import list:', err.message);
    return res
      .status(500)
      .json(formatErrorResponse('Failed to add products to import list', 500, { error: err.message }));
  }
};

export const getImportList = async (req, res) => {
  try {
    let { page = 1, limit = 10, search } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};

    let productIds = [];
    if (search && search.trim()) {
      productIds = await Product.find({
        $or: [{ name: { $regex: search, $options: 'i' } }, { sku: { $regex: search, $options: 'i' } }],
      }).distinct('_id');

      if (productIds.length === 0) {
        return res.status(200).json(
          formatSuccessResponse(
            {
              totalCount: 0,
              currentPage: page,
              totalPages: 0,
              pageSize: limit,
              products: [],
            },
            'Import list fetched successfully'
          )
        );
      }

      filter.product = { $in: productIds };
    }

    const [list, totalCount] = await Promise.all([
      ImportList.find(filter)
        .populate({
          path: 'product',
          model: 'Product',
          select: 'sku name price sale_price active stock_qty product_images categories supplier_platform',
          populate: [
            { path: 'categories', select: 'id name slug' },
            { path: 'supplier_platform', select: 'supplier_id supplier_name slug' },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ImportList.countDocuments(filter),
    ]);

    return res.status(200).json(
      formatSuccessResponse(
        {
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          pageSize: limit,
          products: list,
        },
        'Import list fetched successfully'
      )
    );
  } catch (err) {
    console.error('Error fetching import list:', err.message);
    return res.status(500).json(formatErrorResponse('Failed to fetch import list', 500, { error: err.message }));
  }
};

export const removeFromImportList = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ImportList.findOneAndDelete({ product: id });

    if (!deleted) {
      return res.status(404).json(formatErrorResponse('Product not found in import list'));
    }

    return res.status(200).json(formatSuccessResponse({}, 'Product removed from import list'));
  } catch (err) {
    console.error('Error removing from import list:', err.message);
    return res
      .status(500)
      .json(formatErrorResponse('Failed to remove product from import list', 500, { error: err.message }));
  }
};
