import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import priceService from '#service/priceService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';

/* UPLOAD PRICE FROM GOOGLE SHEET */
export const importPriceFromGoogleSheet = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { url } = req.body;
    if (!url) {
      return failResponse(res, req?.locale?.GOOGLE_SHEET_URL_REQUIRED, 400);
    }
    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) {
      return failResponse(res, req?.locale?.INVALID_URL, 400);
    }
    // Send immediate response to client
    successResponse(res, req?.locale?.PRICE_UPDATE_PROCESSING, 200);
    // Process file in background (async, no await here)
    priceService
      .importPriceFromGoogleSheet(exportUrl, req.locale, sellerId)
      .then((result) => {
        console.log('Google sheet processing completed:', result);
      })
      .catch((error) => {
        console.error('Error in background CSV processing:', error.message);
        // Optionally store error in DB for tracking
      });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export const updateSingleProductPrice = async (req, res) => {
  try {
    const sellerId = req.sellerId; // from auth middleware
    const { productId, price, minPrice, maxPrice, msrp, purchasePrice } = req.body;

    // ---- Mandatory validation ----
    if (!productId || typeof price !== 'number' || price < 0) {
      return failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    // ---- Build payload with optional fields ----
    const pricePayload = {
      productId,
      price,
    };

    if (minPrice !== undefined) pricePayload.minPrice = minPrice;
    if (maxPrice !== undefined) pricePayload.maxPrice = maxPrice;
    if (msrp !== undefined) pricePayload.msrp = msrp;
    if (purchasePrice !== undefined) pricePayload.purchasePrice = purchasePrice;

    const result = await priceService.updateSingleProductPrice(pricePayload, req.locale, sellerId);

    return successResponse(res, req.locale.SUCCESS, 200, result);
  } catch (error) {
    console.error('updateSingleProductPrice error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message, error.statusCode || 500);
  }
};

export default {
  importPriceFromGoogleSheet,
  updateSingleProductPrice,
};
