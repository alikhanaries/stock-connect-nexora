import Responses from '#helpers/response.js';
import Seller from '#models/Seller.js';
import { SELLER_TYPE, USER_ROLES } from '#constants/common.js';

export const sellerMiddleware = async (req, res, next) => {
  try {
    const sellerId = req.sellerId;
    const user = req.user;

    if (user?.role === USER_ROLES.MASTER_ADMIN) {
      const baseSeller = await Seller.findOne({ isDeleted: false, type: SELLER_TYPE.BASE });
      if (!baseSeller) {
        return Responses.failResponse(res, 'You are not connected with to bese seller.', 400);
      }

      req.baseSeller = baseSeller._id;
    }

    if (!sellerId) {
      return Responses.failResponse(res, 'You are not connected with any seller.', 400);
    }

    const seller = await Seller.findOne({ _id: sellerId, isDeleted: false });

    if (!seller) {
      return Responses.failResponse(res, 'You are not connected with this seller.', 400);
    }
    req.seller = seller;

    next();
  } catch (error) {
    console.log('Seller middel ware:', error.message);
    return Responses.failResponse(res, 'Server error', 500);
  }
};
