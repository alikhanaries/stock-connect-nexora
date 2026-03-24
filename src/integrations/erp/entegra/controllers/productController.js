import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { importAllProducts } from '../services/productService.js';

export const syncEntegraProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;

    const isImageUpdate = Object.prototype.hasOwnProperty.call(req.query, 'isImageUpdate')
      ? req.query.isImageUpdate === 'true' || req.query.isImageUpdate === true
      : false;

    setImmediate(async () => {
      try {
        await importAllProducts(sellerId, isImageUpdate);
        console.info(`Entegra sync completed | sellerId=${sellerId} | imageUpdate=${isImageUpdate}`);
      } catch (err) {
        console.error(`Entegra sync failed | sellerId=${sellerId}`, err);
      }
    });

    return successResponse(res, `Entegra product sync started (imageUpdate=${isImageUpdate})`, 202);
  } catch (error) {
    console.error('Failed to start Entrega sync:', error);
    return errorResponse(res, error.message);
  }
};
