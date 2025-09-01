import { errorResponse, failResponse, successResponse } from '#helpers/response.js';
import productService, { pushProductsFromDB } from '#service/productService.js';

export const getProducts = async (req, res) => {
  try {
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query);

    if (!products.length) {
      return failResponse(res, 'No products found', 404, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return successResponse(res, 'Products fetched successfully', 200, {
      content: products,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    return errorResponse(res, err, 500);
  }
};

export const pushProductToChannelEngine = async (req, res) => {
  try {
    const maxProducts = parseInt(req.query.limit || '500', 10);

    // 🔹 Background push (fire-and-forget)
    setImmediate(async () => {
      try {
        await pushProductsFromDB(maxProducts);
        console.log(`Background push completed for up to ${maxProducts} products`);
      } catch (err) {
        console.error('Background push error:', err);
      }
    });

    // 🔹 Return early
    return successResponse(res, 'Products push started in background', 202, {
      message: `Up to ${maxProducts} products will be pushed`,
    });
  } catch (err) {
    console.error('Controller Error:', err);
    return errorResponse(res, err, 500);
  }
};
