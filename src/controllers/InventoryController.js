import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import inventoryService from '#service/InventoryService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';

/* UPLOAD INVENTORY FROM GOOGLE SHEET */
export const importInventoryFromGoogleSheet = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { url } = req.body;
    if (!req.body.url) {
      return failResponse(res, req?.locale?.GOOGLE_SHEET_URL_REQUIRED, 400);
    }
    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) {
      return failResponse(res, req?.locale?.INVALID_URL, 500);
    }
    // Send immediate response to client
    successResponse(res, req?.locale?.INVENTORY_IMPORTED_PROCESSING, 200);
    // Process file in background (async, no await here)
    inventoryService
      .importInventoryFromGoogleSheet(exportUrl, req.locale, sellerId)
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

export default {
  importInventoryFromGoogleSheet,
};
