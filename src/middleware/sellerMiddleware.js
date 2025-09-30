import Responses from '#helpers/response.js';
import Seller from '#models/Seller.js';
import { ROLES_BASED_USER_FETCHING, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';

export const sellerMiddleware = async (req, res, next) => {
  try {
    const sellerIds = req.sellerIds;
    if (!sellerIds) {
      return Responses.failResponse(res, 'You are not connected with any seller.', 400);
    }
    const seller = await Seller.find({ _id: { $in: sellerIds } });
    req.seller = seller;
    next();
  } catch (error) {
    console.log('Seller middel ware:', error.message);
    return Responses.failResponse(res, 'Server error', 500);
  }
};

export const canAccessSeller = async (req, res, next) => {
  try {
    const user = req.user;
    const connectedSellerIds = req.sellerIds;
    const { sellerId } = req.params;
    req.sellerId = new mongoose.Types.ObjectId(sellerId);

    if (user.role === USER_ROLES.MASTER_ADMIN) {
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
    console.error('Error in canAccessSeller middleware:', error.message);
    return Responses.errorResponse(res, 'An internal server error occurred during authorization.', 500);
  }
};
