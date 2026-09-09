import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import priceService from '#service/priceService.js';
import emailService from '#service/emailService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

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
        // Send email notification after processing
        if ((result.updatedCount || 0) > 0 || (result.invalidRowsCount || 0) > 0) {
          emailService.updatePriceMailService({
            to: req.user.email,
            userName: req.user.firstName,
            updateStatus: result.success ? 'SUCCESS' : 'FAILED',
            errorDetails: result.errorDetails || [],
          });
        }
        // Optionally update DB with processing status
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
    const { productId, price, namshiPrice, noonPrice, amazonPrice, minPrice, maxPrice, msrp, purchasePrice } = req.body;

    // ---- Build payload with optional fields ----
    const pricePayload = {
      productId,
    };
    if (price !== undefined) pricePayload.price = price;
    if (noonPrice !== undefined) pricePayload.noonPrice = noonPrice;
    if (namshiPrice !== undefined) pricePayload.namshiPrice = namshiPrice;
    if (amazonPrice !== undefined) pricePayload.amazonPrice = amazonPrice;
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
    const sellerId = req.sellerId;
    const filePath = req.file?.path;

    if (!filePath) {
      return failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    // 1. Send response immediately (DO NOT await background task)
    successResponse(res, req.locale.PRICE_UPDATE_PROCESSING, 200);

    // 2. Run background task asynchronously
    (async () => {
      try {
        const result = await priceService.importPriceFromCsvFile(filePath, req.locale, sellerId);

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
        // Send email notification after processing
        if ((result.updatedCount || 0) > 0 || (result.invalidRowsCount || 0) > 0) {
          emailService.updateInventoryMailService({
            to: req.user.email,
            userName: req.user.firstName,
            updateStatus: result.success ? 'SUCCESS' : 'FAILED',
            errorDetails: result.errorDetails || [],
          });
        }
        // Optionally update DB with processing status
      } catch (err) {
        console.error('Error in background CSV processing:', err.message);
        errorLog(err);
        // Optional: save failure status in DB / job table
      }
    })();
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export const syncPriceToChannelEngine = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    trackBackgroundSync(sellerId, () => priceService.syncPriceToChannelEngine(sellerId), {
      label: 'Syncing prices',
      field: 'pricing',
    });
    successResponse(res, req.locale.SYNC_STARTED, 202);
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
