import response from '#helpers/response.js';
import sellerService from '#service/sellerService.js';
import { PRODUCT_STATUSES } from '#constants/common.js';
import mongoose from 'mongoose';
import { getAymakanShipmentCitiesAPI } from '../service/aymakanService.js';

export const getSellerById = async (req, res) => {
  try {
    const { id } = req.params;
    const userData = await sellerService.getSellerById(id);
    if (!userData) {
      return response.failResponse(res, req.locale.NO_SELLER_FOUND, 404);
    }
    return response.successResponse(res, req.locale.GET_SELLER_SUCCESS, 200, userData);
  } catch (error) {
    console.log('Update seller error: ', error);
    return response.errorResponse(res, error.message, 500);
  }
};
export const updateSeller = async (req, res) => {
  try {
    const { id } = req.params;

    const { name, status } = req.body;

    const statusValue = status?.toString().toLowerCase();
    if (!statusValue || !PRODUCT_STATUSES.includes(statusValue)) {
      return response.failResponse(res, `${'Please provide valid status'} ${PRODUCT_STATUSES.join(', ')}`, 400);
    }

    const updatedSeller = await sellerService.updateSeller(id, name, statusValue);
    if (!updatedSeller) {
      return response.failResponse(res, 'Seller not found', 404);
    }
    return response.successResponse(res, 'Seller Updated sucessfully', 200, updatedSeller);
  } catch (error) {
    console.log('Update seller error: ', error);
    return response.errorResponse(res, error.message, 500);
  }
};

export const updateSellerStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return response.failResponse(res, 'please provide array of ids', 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return response.failResponse(res, `${'Please provide valid Ids'} ${invalidIds.join(', ')}`, 400);
    }
    const statusValue = status?.toString().toLowerCase();
    if (!statusValue || !PRODUCT_STATUSES.includes(statusValue)) {
      return response.failResponse(res, `${'Please provide valid status'} ${PRODUCT_STATUSES.join(', ')}`, 400);
    }
    const updatedCount = await sellerService.updateSellerStatus(ids, statusValue);
    if (updatedCount === 0) {
      return response.failResponse(res, 'No Matching sellers found to Update.', 404);
    }
    const statusMessage =
      statusValue === 'active' ? 'Seller Activated Successfully' : 'Seller Deactivated Successfully';
    return response.successResponse(res, statusMessage, 200);
  } catch (err) {
    console.error('Error updating Seller status:', err);
    return response.errorResponse(res, err.message, 500);
  }
};

export const softDeleteSellers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return response.failResponse(res, req.locale.SELLERIDS_REQUIRED, 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return response.failResponse(res, `${req.locale.VALID_SELLER_IDS} ${invalidIds.join(', ')}`, 400);
    }
    const deletedSellers = await sellerService.softDeleteSellers(ids);
    if (!deletedSellers || deletedSellers.modifiedCount === 0) {
      return response.failResponse(res, req.locale.NO_SELLER_FOUND, 404);
    }

    const statusMessage = `${deletedSellers.modifiedCount} ${req.locale.SELLER_DELETED}`;
    return response.successResponse(res, statusMessage, 200);
  } catch (err) {
    console.error('Error updating Seller status:', err);
    return response.errorResponse(res, err.message, 500);
  }
};

export const createSeller = async (req, res) => {
  try {
    const newSeller = await sellerService.createSeller(req.body);

    if (!newSeller.data) {
      return response.failResponse(res, 'Failed to create seller.', 500);
    }

    if (newSeller.isExist) {
      return response.failResponse(res, 'A seller with this name already exists.', 409);
    }
    return response.successResponse(res, 'Seller created successfully', 201, newSeller.data);
  } catch (error) {
    console.error('Error creating seller:', error);
    return response.errorResponse(res, error.message, 500);
  }
};
export const getAllSeller = async (req, res) => {
  try {
    const creatorRole = req.user.role;
    const creatorId = req.user._id;
    const { seller, pagination, appliedFilters } = await sellerService.getAllSeller(req.query, creatorId, creatorRole);
    const responseData = {
      content: seller || [],
      appliedFilters: appliedFilters || {},
      ...(pagination && { pagination }),
    };
    const message = seller && seller.length > 0 ? 'Seller fetched successfully' : 'No Seller found';

    return response.successResponse(res, message, 200, responseData);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const savePickupAddress = async (req, res) => {
  try {
    const result = await sellerService.saveSellerPickUpAdressDetails(req.body);

    if (!result) {
      return response.failResponse(res, 'Failed to save seller pick up address.', 500);
    }

    return response.successResponse(res, 'Seller pick up adress saved successfully', 201, null);
  } catch (error) {
    console.error('Error creating seller:', error);
    return response.errorResponse(res, error.message || 'Internal server error', 500);
  }
};

export const getAyMakanCities = async (req, res) => {
  try {
    const result = await getAymakanShipmentCitiesAPI();

    if (!result.data.cities) {
      // This can happen if service returns false for invalid inputs
      return response.errorResponse(res, 'No city found', 400, null);
    }

    return response.successResponse(res, 'Cities found', 200, result.data.cities);
  } catch (error) {
    console.error('Create Shipment Controller Error:', error.message, error.stack);
    return response.errorResponse(res, error?.message || 'Internal error', 400);
  }
};
