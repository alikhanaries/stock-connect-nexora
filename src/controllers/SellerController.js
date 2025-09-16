import response from '#helpers/response.js';
import sellerService from '#service/sellerService.js';
import { PRODUCT_STATUSES } from '#constants/common.js';
import mongoose from 'mongoose';

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
    return response.errorResponse(res, error, 500);
  }
};

export const softDeleteSeller = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedSeller = await sellerService.deleteSeller(id);

    if (deletedSeller.isDeleted) {
      return response.failResponse(res, 'Seller not found.', 404);
    }
    return response.successResponse(res, 'Seller deleted sucessfully', 200);
  } catch (error) {
    return response.errorResponse(res, error, 500);
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
    return response.errorResponse(res, err, 500);
  }
};
