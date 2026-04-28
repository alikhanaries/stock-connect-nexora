import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { getMappingBySellerSlug } from '../helpers/brandMapping.js';
import { xokidsInventorySync } from '../services/inventoryService.js';

export const syncXokidsInventory = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    const mapping = getMappingBySellerSlug(seller.slug);
    if (!mapping) return errorResponse(res, `Seller slug "${seller.slug}" is not a supported brand`);

    const { displayBrand } = mapping;
    if (!displayBrand) return errorResponse(res, `Display brand is missing for seller slug "${seller.slug}"`);

    setImmediate(() => {
      xokidsInventorySync(sellerId).catch((err) => console.error(`${displayBrand} inventory sync failed:`, err));
    });

    return successResponse(res, `${displayBrand} inventory sync started in background`, 202);
  } catch (error) {
    console.error('Failed to start Xokids inventory sync:', error);
    return errorResponse(res, error.message);
  }
};
