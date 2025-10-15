import { ROLES_BASED_USER_FETCHING, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';
import Responses from '#helpers/response.js';
import Seller from '#models/Seller.js';

export const verifySellerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const connectedSellerIds = req.sellerIds;
    let { sellerId } = req.query;
    if (user?.role === USER_ROLES.MASTER_ADMIN) {
      if (!sellerId) {
        sellerId = await Seller.findOne({ isDeleted: false, type: SELLER_TYPE.NORMAL });
      }
      req.sellerId = new mongoose.Types.ObjectId(sellerId);
      return next();
    }
    if (!sellerId) {
      sellerId = connectedSellerIds[0];
    }

    if (!Array.isArray(connectedSellerIds)) {
      console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
      return Responses.errorResponse(res, 'Server configuration error', 500);
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      if (connectedSellerIds.includes(sellerId)) {
        req.sellerId = new mongoose.Types.ObjectId(sellerId);
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
