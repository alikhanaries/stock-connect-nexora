import { errorResponse, successResponse } from '#helpers/response.js';
import Responses from '../helpers/response.js';
import productService, { pushProductsFromDB } from '#service/productService.js';


export const getProducts = async (req, res) => {
  try {
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query);
    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products.length ? 'Products fetched successfully' : 'No products found';
    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error fetching products:', error);
    return errorResponse(res, error, 500);
  }
};

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
export const uploadProductsFromGoogleSheet = async (req, res) => {
  try {
    if (!req.body.url) {
      return Responses.failResponse(res, 'Google Sheet URL required', 400);
    }
    const { url } = req.body;
    const result = await productService.uploadProductsFromGoogleSheet(url);
    // Handle failure from service
    if (!result?.success) {
      return Responses.failResponse(res, result?.message || 'Error in upload', 500);
    }

    // Success response with details
    return Responses.successResponse(res, result.message, 200, {
      insertedCount: result.insertedCount,
      invalidRowsCount: result.invalidRowsCount,
      errorRows: result.errorRows,
    });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message);
  }
};

/* UPLOAD PRODUCTS FROM CSV FILE */
export const uploadProductsFromCsvFile = async (req, res) => {
  try {
    // Call service
    const result = await productService.uploadProductsFromCsvFile(req.file.path);

    // Handle failure from service
    if (!result?.success) {
      return Responses.failResponse(res, result?.message || 'Error in upload', 500);
    }

    // Success response with details
    return Responses.successResponse(res, result.message, 200, {
      insertedCount: result.insertedCount,
      invalidRowsCount: result.invalidRowsCount,
      errorRows: result.errorRows,
    });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message);
  }
};

export const pushProductToChannelEngine = async (req, res) => {
  try {
    const maxProducts = Math.max(1, parseInt(req.query.limit || '500', 10));

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
