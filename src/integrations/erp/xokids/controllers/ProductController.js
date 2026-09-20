import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { getMappingBySellerSlug } from '../helpers/brandMapping.js';
import { getXokidsProducts } from '../services/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncXokidsProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    const mapping = getMappingBySellerSlug(seller.slug);
    if (!mapping) return errorResponse(res, `Seller slug "${seller.slug}" is not a supported brand`);

    const { displayBrand } = mapping;
    if (!displayBrand) return errorResponse(res, `Display brand is missing for seller slug "${seller.slug}"`);

    trackBackgroundSync(sellerId, () => getXokidsProducts(sellerId, isImageUpdate), {
      label: 'Syncing products',
      field: 'products',
    });

    return successResponse(res, `${displayBrand} product sync started in background`, 202);
  } catch (error) {
    console.error('Failed to start Xokids sync:', error);
    return errorResponse(res, error.message);
  }
};
