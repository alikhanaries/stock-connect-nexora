import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import inventoryService from '#service/InventoryService.js';
import emailService from '#service/emailService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';
import { config } from '../config/config.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';
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

export const updateSingleInventory = async (req, res) => {
  try {
    const sellerId = req.sellerId; // from auth middleware
    const { productId, currentStockCount } = req.body;

    // Extra safety (validator already handles this, but OK to keep)
    if (!productId || typeof currentStockCount !== 'number') {
      return failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    const result = await inventoryService.updateSingleInventory(productId, currentStockCount, req.locale, sellerId);

    return successResponse(res, req.locale.SUCCESS, 200, result);
  } catch (error) {
    console.error('updateSingleInventory error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message, error.statusCode);
  }
};

export const syncStockToChannelEngine = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    inventoryService.syncStockToChannelEngine(sellerId).catch((err) => console.error('Async stock push failed:', err));

    successResponse(res, req.locale.SYNC_STARTED, 202);
  } catch (err) {
    console.error('Controller syncInventory error:', err);
    return errorResponse(res, err.message);
  }
};

/* UPLOAD PRODUCTS FROM EXPRESSWAREHOUSE GOOGLE SHEET */
export const importProductsFromExpressWarehouseGoogleSheet = async (req, res) => {
  try {
    const url = config?.EXPRESS_WAREHOUSE_PRODUCTS_SHEET;

    if (!url) {
      return failResponse(res, req?.locale?.GOOGLE_SHEET_URL_REQUIRED, 400);
    }
    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) {
      return failResponse(res, req?.locale?.INVALID_URL, 500);
    }
    const sellerId = req.sellerId;
    trackBackgroundSync(
      sellerId,
      async () => {
        const result = await inventoryService.importExpressWarehouseProductsFromGoogleSheet(exportUrl, req.locale);
        emailService.updateExpressWarehouseInventoryMailService({
          to: req?.user?.email,
          userName: req?.user?.firstName,
          importStatus: result?.success ? 'SUCCESS' : 'FAILED',
          errorDetails: result?.errorDetails || [],
        });
        if (!result?.success) {
          throw new Error(result?.message || 'Warehouse sync failed');
        }
        return result;
      },
      { label: 'Syncing warehouse', field: 'warehouse' }
    );
    successResponse(res, req?.locale?.RETURNED_PRODUCTS_SYNC_PROCESSING, 200);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export default {
  importInventoryFromGoogleSheet,
  importInventoryFromCsvFile,
  updateSingleInventory,
  syncStockToChannelEngine,
  importProductsFromExpressWarehouseGoogleSheet,
};
