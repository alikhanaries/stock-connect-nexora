import { ROLES_BASED_USER_FETCHING, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';
import Seller from '#models/Seller.js';

export const verifyUnicommerceSellerAccess = async (req, res, next) => {
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
    if (!Array.isArray(connectedSellerIds)) {
      console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
      return res.status(500).send({ message: 'Server configuration error' });
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      if (connectedSellerIds.includes(sellerId)) {
        req.sellerId = new mongoose.Types.ObjectId(sellerId);
        return next();
      } else {
        return res.status(400).send({ message: 'You do not have access to this seller' });
      }
    }
  } catch (error) {
    console.error('Error in verifySellerAccess middleware:', error.message);
    return res.status(500).send({ message: 'An internal server error occurred during authorization.' });
  }
};
