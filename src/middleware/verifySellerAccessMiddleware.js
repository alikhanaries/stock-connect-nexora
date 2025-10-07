import { ROLES_BASED_USER_FETCHING, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';
import Responses from '#helpers/response.js';

export const verifySellerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const connectedSellerIds = req.sellerIds;
    const { sellerId } = req.params;
    req.sellerId = new mongoose.Types.ObjectId(sellerId);

    if (user?.role === USER_ROLES.MASTER_ADMIN) {
      return next();
    }

    if (!Array.isArray(connectedSellerIds)) {
      console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
      return Responses.errorResponse(res, 'Server configuration error', 500);
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      if (connectedSellerIds.includes(sellerId)) {
        return next();
      } else {
        return Responses.failResponse(res, 'You do not have access to this seller', 400);
      }
    }
  } catch (error) {
    console.error('Error in verifySellerAccess middleware:', error.message);
    return Responses.errorResponse(res, 'An internal server error occurred during authorization.', 500);
  }
};
