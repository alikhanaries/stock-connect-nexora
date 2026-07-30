import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import omnifulInventoryService from '#service/omnifulInventoryService.js';
import { errorLog } from '#middleware/index.js';

export const syncOmnifulWarehouseInventory = async (req, res) => {
  try {
    const result = await omnifulInventoryService.syncOmnifulWarehouseInventory({ trigger: 'manual' });
    return successResponse(res, 'Omniful warehouse inventory synced successfully', 200, result);
  } catch (error) {
    console.error('syncOmnifulWarehouseInventory error:', error.message);
    errorLog(error);
    return failResponse(res, error.message, 500);
  }
};

export const getOmnifulWarehouseInventory = async (req, res) => {
  try {
    const data = await omnifulInventoryService.getOmnifulWarehouseInventoryList(req.query);
    return successResponse(res, 'Omniful warehouse inventory fetched successfully', 200, data);
  } catch (error) {
    console.error('getOmnifulWarehouseInventory error:', error.message);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export const getOmnifulInventorySyncStatus = async (req, res) => {
  try {
    const data = await omnifulInventoryService.getOmnifulInventorySyncStatus();
    return successResponse(res, 'Omniful inventory sync status fetched successfully', 200, data);
  } catch (error) {
    console.error('getOmnifulInventorySyncStatus error:', error.message);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export const getOmnifulInventorySyncLogs = async (req, res) => {
  try {
    const data = await omnifulInventoryService.getOmnifulInventorySyncLogs(req.query);
    return successResponse(res, 'Omniful inventory sync logs fetched successfully', 200, { logs: data });
  } catch (error) {
    console.error('getOmnifulInventorySyncLogs error:', error.message);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export default {
  syncOmnifulWarehouseInventory,
  getOmnifulWarehouseInventory,
  getOmnifulInventorySyncStatus,
  getOmnifulInventorySyncLogs,
};
