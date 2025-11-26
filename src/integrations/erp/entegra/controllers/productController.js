import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { importAllProducts } from '../services/productService.js';

export const syncEntegraProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;

    process.nextTick(() => {
      importAllProducts(sellerId).catch((err) => console.error('Entrega products background sync failed:', err));
    });

    return successResponse(res, 'Entrega product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Entrega sync:', error);
    return errorResponse(res, error.message);
  }
};
