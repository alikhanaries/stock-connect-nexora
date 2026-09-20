import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#models/Seller.js';
import { isSentosConfigured } from '../config/config.js';
import { isSentosSellerSlug } from '../helpers/sellerHelper.js';
import { importAllSentosProducts } from '../services/productService.js';
import { logSentosError, logSentosInfo } from '../utils/logger.js';

export const syncSentosProducts = async (req, res) => {
  try {
    if (!isSentosConfigured()) {
      return errorResponse(res, 'Sentos integration is not configured');
    }

    const sellerId = req.sellerId;
    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();

    if (!seller?.slug) {
      return errorResponse(res, `Seller ${sellerId} not found or missing slug`);
    }

    if (!isSentosSellerSlug(seller.slug)) {
      return errorResponse(res, `Seller slug "${seller.slug}" is not configured for Sentos`);
    }

    logSentosInfo('Product sync accepted (HTTP 202)', { sellerId, sellerSlug: seller.slug });

    setImmediate(() => {
      importAllSentosProducts(sellerId).catch((err) =>
        logSentosError('Product sync background job failed', {
          sellerId,
          message: err.message,
          name: err.name,
          stack: err.stack,
        })
      );
    });

    return successResponse(res, 'Sentos product sync started in background', 202);
  } catch (error) {
    logSentosError('Product sync start failed', { message: error.message, stack: error.stack });
    return errorResponse(res, error.message);
  }
};
