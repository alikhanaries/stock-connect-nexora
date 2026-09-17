import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { importAllProducts } from '../service/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncRespireProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    const isImageUpdate = Object.prototype.hasOwnProperty.call(req.query, 'isImageUpdate')
      ? req.query.isImageUpdate === 'true' || req.query.isImageUpdate === true
      : true;

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    trackBackgroundSync(sellerId, () => importAllProducts(sellerId, isImageUpdate), {
      label: 'Syncing products',
      field: 'products',
    });

    return successResponse(res, 'Respire product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Respire sync:', error);
    return errorResponse(res, error.message);
  }
};
