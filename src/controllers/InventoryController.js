import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import inventoryService from '#service/InventoryService.js';
import emailService from '#service/emailService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';

/* UPLOAD INVENTORY FROM GOOGLE SHEET */
export const importInventoryFromGoogleSheet = async (req, res) => {
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
    successResponse(res, req?.locale?.INVENTORY_IMPORTED_PROCESSING, 200);
    // Process file in background (async, no await here)
    inventoryService
      .importInventoryFromGoogleSheet(exportUrl, req.locale, sellerId)
      .then((result) => {
        console.log('Google sheet processing completed:', result);
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

/* UPLOAD INVENTORY FROM CSV FILE */
export const importInventoryFromCsvFile = async (req, res) => {
  try {
    // Send immediate response to client
    successResponse(res, req?.locale?.INVENTORY_IMPORTED_PROCESSING, 200);
    // Call service
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';
    // Process file in background (async, no await here)
    inventoryService
      .importInventoryFromCsvFile(req.file.path, req.locale, sellerId, isImageUpdate)
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
  importInventoryFromCsvFile,
};
