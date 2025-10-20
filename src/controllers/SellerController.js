import response from '#helpers/response.js';
import sellerService from '#service/sellerService.js';
import { PRODUCT_STATUSES } from '#constants/common.js';
import mongoose from 'mongoose';

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
      return response.failResponse(
        res,
        `${req.locale.PLEASE_PROVIDE_VALID_STATUS} ${PRODUCT_STATUSES.join(', ')}`,
        400
      );
    }

    const updatedSeller = await sellerService.updateSeller(id, name, statusValue);
    if (!updatedSeller) {
      return response.failResponse(res, req.locale.SELLER_NOT_FOUND, 404);
    }
    return response.successResponse(res, req.locale.SELLER_UPDATED_SUCCESSFULLY, 200, updatedSeller);
  } catch (error) {
    console.log('Update seller error: ', error);
    return response.errorResponse(res, error.message, 500);
  }
};

export const updateSellerStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return response.failResponse(res, req.locale.SELLERIDS_REQUIRED, 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return response.failResponse(res, `${req.locale.VALID_SELLER_IDS} ${invalidIds.join(', ')}`, 400);
    }
    const statusValue = status?.toString().toLowerCase();
    if (!statusValue || !PRODUCT_STATUSES.includes(statusValue)) {
      return response.failResponse(
        res,
        `${req.locale.PLEASE_PROVIDE_VALID_STATUS} ${PRODUCT_STATUSES.join(', ')}`,
        400
      );
    }
    const updatedCount = await sellerService.updateSellerStatus(ids, statusValue);
    if (updatedCount === 0) {
      return response.failResponse(res, req.locale.NO_MATCHING_SELLERS_FOUND_TO_UPDATE, 404);
    }
    const statusMessage =
      statusValue === 'active' ? req.locale.SELLER_ACTIVATED_SUCCESSFULLY : req.locale.SELLER_DEACTIVATED_SUCCESSFULLY;
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
      return response.failResponse(res, req.locale.FAILED_TO_CREATE_SELLER, 500);
    }

    if (newSeller.isExist) {
      return response.failResponse(res, req.locale.SELLER_NAME_EXISTS, 409);
    }
    return response.successResponse(res, req.locale.SELLER_CREATED_SUCCESSFULLY, 201, newSeller.data);
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
    const message = seller && seller.length > 0 ? req.locale.SELLER_FETCHED_SUCCESSFULLY : req.locale.NO_SELLER_FIND;

    return response.successResponse(res, message, 200, responseData);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};
