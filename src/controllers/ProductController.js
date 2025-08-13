import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import channelEngineService from '#service/channelService.js';
function validateProduct(products) {
  const requiredFields = ['Name', 'MerchantProductNo', 'Price'];
  const errors = [];

  products.forEach((p, idx) => {
    requiredFields.forEach((field) => {
      if (p[field] === undefined || p[field] === null || p[field] === '') {
        errors.push(`Product ${idx + 1}: Missing required field "${field}"`);
      }
    });
  });

  return errors;
}

export const pushToStore = async (req, res) => {
  try {
    const products = Array.isArray(req.body) ? req.body : req.body.product;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No products provided',
        errors: ['At least one product is required'],
      });
    }

    console.log(products, 'product');

    const missingFields = validateProduct(products);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Missing required fields.',
        errors: missingFields,
      });
    }

    const response = await channelEngineService.addProducts(products);

    if (response?.ValidationErrors && Object.keys(response.ValidationErrors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Product validation failed at ChannelEngine',
        errors: response.ValidationErrors,
      });
    }

    if (response?.Content?.ProductMessages?.some((pm) => pm.Errors?.length > 0)) {
      const productErrors = response.Content.ProductMessages.flatMap((pm) => pm.Errors);
      return res.status(400).json({
        success: false,
        message: 'Some products were rejected',
        errors: productErrors,
      });
    }

    return res.status(200).json(
      formatSuccessResponse(
        {
          acceptedCount: response?.Content?.AcceptedCount || 0,
          rejectedCount: response?.Content?.RejectedCount || 0,
        },
        'Product(s) added successfully'
      )
    );
  } catch (err) {
    console.error('Error adding products to store:', err.stack || err.message);
    return res.status(500).json(formatErrorResponse('Failed to add products to store', 500, { error: err.message }));
  }
};

export const getMyProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive, merchantProductNo } = req.query;

    const data = await channelEngineService.getProducts({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      merchantProductNo,
    });

    return res.status(200).json({
      success: true,
      message: 'Products fetched successfully',
      totalCount: data.TotalCount,
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(data.TotalCount / parseInt(limit, 10)),
      pageSize: parseInt(limit, 10),
      products: data.Content,
    });
  } catch (err) {
    console.error('Error fetching products:', err.stack || err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: err.message,
    });
  }
};
