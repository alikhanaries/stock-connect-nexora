import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { getMappingBySellerSlug } from '../helpers/brandMapping.js';
import { getXokidsProducts } from '../services/productService.js';

export const syncXokidsProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    const mapping = getMappingBySellerSlug(seller.slug);
    if (!mapping) return errorResponse(res, `Seller slug "${seller.slug}" is not a supported brand`);

    const { displayBrand } = mapping;

    setImmediate(() => {
      getXokidsProducts(sellerId, isImageUpdate).catch((err) =>
        console.error(`${displayBrand} background sync failed:`, err)
      );
    });

    return successResponse(res, `${displayBrand} product sync started in background`, 202);
  } catch (error) {
    console.error('Failed to start product sync:', error);
    return errorResponse(res, error.message);
  }
};
