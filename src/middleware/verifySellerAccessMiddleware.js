import { ROLES_BASED_USER_FETCHING, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';
import Responses from '#helpers/response.js';
import Seller from '#models/Seller.js';

const SELLER_AUTH_FORBIDDEN_MESSAGE = 'You are not authorized to access seller resources';

const rejectInvalidSellerIds = (res) => {
  console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
  return Responses.failResponse(res, SELLER_AUTH_FORBIDDEN_MESSAGE, 403);
};

export const verifySellerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const connectedSellerIds = req.sellerIds;
    let sellerId = req.query.sellerId ?? req.params.sellerId;

    if (user?.role === USER_ROLES.MASTER_ADMIN) {
      if (!sellerId) {
        const seller = await Seller.findOne({ isDeleted: false, type: SELLER_TYPE.NORMAL }).select('_id').lean();

        if (!seller) return Responses.failResponse(res, 'No seller found', 404);

        sellerId = seller._id;
      }
      req.sellerId = new mongoose.Types.ObjectId(sellerId);
      return next();
    }

    if (!sellerId) {
      return Responses.failResponse(res, 'Seller ID is required', 400);
    }

    if (!Array.isArray(connectedSellerIds)) {
      return rejectInvalidSellerIds(res);
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      if (connectedSellerIds.includes(sellerId)) {
        req.sellerId = new mongoose.Types.ObjectId(sellerId);
        return next();
      } else {
        return Responses.failResponse(res, 'You do not have access to this seller', 400);
      }
    }

    return Responses.failResponse(res, 'You do not have access to this seller', 403);
  } catch (error) {
    console.error('Error in verifySellerAccess middleware:', error.message);
    return Responses.errorResponse(res, 'An internal server error occurred during authorization.', 500);
  }
};

export const verifyMultipleSellerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    const connectedSellerIds = req.sellerIds;
    let { sellerId } = req.query;

    const isAll = typeof sellerId === 'string' && sellerId.trim().toLowerCase() === 'all';
    if (isAll) {
      if (user?.role === USER_ROLES.MASTER_ADMIN) {
        const sellers = await Seller.find({ isDeleted: false, type: SELLER_TYPE.NORMAL }).select('_id').lean();

        if (!sellers?.length) return Responses.failResponse(res, 'No seller found', 404);

        const ids = sellers.map((s) => s._id.toString());
        req.sellerId = new mongoose.Types.ObjectId(ids[0]);
        req.sellerIds = ids;
        return next();
      }

      if (!Array.isArray(connectedSellerIds) || connectedSellerIds.length === 0) {
        if (!Array.isArray(connectedSellerIds)) {
          return rejectInvalidSellerIds(res);
        }
        return Responses.failResponse(res, SELLER_AUTH_FORBIDDEN_MESSAGE, 403);
      }

      req.sellerId = new mongoose.Types.ObjectId(connectedSellerIds[0]);
      req.sellerIds = connectedSellerIds;
      return next();
    }
    const sellerIds = String(sellerId ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (user?.role === USER_ROLES.MASTER_ADMIN) {
      if (!sellerIds.length) {
        const seller = await Seller.findOne({ isDeleted: false, type: SELLER_TYPE.NORMAL }).select('_id').lean();
        if (!seller?._id) return Responses.failResponse(res, 'No seller found', 404);

        req.sellerId = seller._id;
        req.sellerIds = [seller._id.toString()];
        return next();
      }

      for (const id of sellerIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return Responses.failResponse(res, `Invalid sellerId: ${id}`, 400);
        }
      }

      req.sellerId = new mongoose.Types.ObjectId(sellerIds[0]);
      req.sellerIds = sellerIds;
      return next();
    }

    if (!Array.isArray(connectedSellerIds)) {
      return rejectInvalidSellerIds(res);
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      const hasAccessToAll = sellerIds.length > 0 && sellerIds.every((id) => connectedSellerIds.includes(id));
      if (!hasAccessToAll) {
        return Responses.failResponse(res, 'You do not have access to this seller', 400);
      }

      for (const id of sellerIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return Responses.failResponse(res, `Invalid sellerId: ${id}`, 400);
        }
      }

      req.sellerId = new mongoose.Types.ObjectId(sellerIds[0]);
      req.sellerIds = sellerIds;
      return next();
    }
    return Responses.failResponse(res, 'You do not have access to this seller', 400);
  } catch (error) {
    console.error('Error in verifySellerAccess middleware:', error.message);
    return Responses.errorResponse(res, 'An internal server error occurred during authorization.', 500);
  }
};
