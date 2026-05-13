import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { getMappingBySellerSlug } from '../helpers/brandMapping.js';
import { importAllProducts } from '../service/productService.js';

export const syncEntegraProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    const isImageUpdate = Object.prototype.hasOwnProperty.call(req.query, 'isImageUpdate')
      ? req.query.isImageUpdate === 'true' || req.query.isImageUpdate === true
      : false;

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    const mapping = getMappingBySellerSlug(seller.slug);
    if (!mapping) return errorResponse(res, `Seller slug "${seller.slug}" is not a supported brand`);

    const { displayBrand } = mapping;
    if (!displayBrand) return errorResponse(res, `Display brand is missing for seller slug "${seller.slug}"`);

    setImmediate(() => {
      importAllProducts(sellerId, isImageUpdate).catch((err) =>
        console.error(`${displayBrand} background sync failed:`, err)
      );
    });

    return successResponse(res, `${displayBrand} product sync started in background`, 202);
  } catch (error) {
    console.error('Failed to start Entegra sync:', error);
    return errorResponse(res, error.message);
  }
};
