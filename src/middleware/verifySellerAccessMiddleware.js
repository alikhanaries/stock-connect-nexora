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
        const defaultSeller = await Seller.findOne({ isDeleted: false, type: SELLER_TYPE.NORMAL }, '_id');

        if (!defaultSeller) {
          return Responses.failResponse(res, 'No active sellers found in the system.', 404);
        }
        req.sellerId = defaultSeller._id;
        return next();
      } else {
        const verifySeller = await Seller.countDocuments({ _id: sellerId, isDeleted: false });
        if (verifySeller > 0) {
          req.sellerId = new mongoose.Types.ObjectId(sellerId);
          return next();
        } else {
          return Responses.failResponse(res, 'the SellerId you have provided does not exists', 400);
        }
      }
    }

    if (!Array.isArray(connectedSellerIds)) {
      console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
      return Responses.errorResponse(res, 'Server configuration error', 500);
    }
    if (connectedSellerIds.length === 0) {
      return Responses.failResponse(res, 'You are not associated with any sellers.', 403);
    }

    if (!sellerId) {
      sellerId = new mongoose.Types.ObjectId(connectedSellerIds[0]);
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      if (connectedSellerIds.includes(sellerId)) {
        req.sellerId = new mongoose.Types.ObjectId(sellerId);
        return next();
      } else {
        return Responses.failResponse(res, 'You do not have access to this seller', 400);
      }
    }
    return Responses.failResponse(res, 'Your user role is not authorized for this action.', 403);
  } catch (error) {
    console.error('Error in verifySellerAccess middleware:', error.message);
    return Responses.errorResponse(res, 'An internal server error occurred during authorization.', 500);
  }
};
