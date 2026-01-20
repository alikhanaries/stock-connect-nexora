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

/* UPLOAD PRICE FROM CSV FILE */
export const importPriceFromCsvFile = async (req, res) => {
  try {
    // Send immediate response to client
    successResponse(res, req?.locale?.PRICE_UPDATE_PROCESSING, 200);
    // Call service
    const sellerId = req.sellerId;
    // Process file in background (async, no await here)
    priceService
      .importPriceFromCsvFile(req.file.path, req.locale, sellerId)
      .then((result) => {
        console.log('CSV processing completed', {
          success: result.success,
          message: result.message,
          updatedCount: result.updatedCount || 0,
          invalidRowsCount: result.invalidRowsCount || 0,
          errors: result.errorDetails?.length || 0,
        });

        if (result.errorDetails?.length) {
          console.error('CSV processing errors:', result.errorDetails);
        }
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

export const syncPriceToChannelEngine = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    // Immediate response (non-blocking)
    successResponse(res, req.locale.SYNC_STARTED, 202);

    // Background execution (NO await)
    priceService
      .syncPriceToChannelEngine(sellerId)
      .then((result) => {
        console.log('Price sync completed:', result);
      })
      .catch((err) => {
        console.error('Price sync failed:', err.message);
      });
  } catch (err) {
    console.error('Controller syncPrice error:', err);
    return errorResponse(res, err.message);
  }
};

export default {
  importPriceFromGoogleSheet,
  updateSingleProductPrice,
  importPriceFromCsvFile,
  syncPriceToChannelEngine,
};
