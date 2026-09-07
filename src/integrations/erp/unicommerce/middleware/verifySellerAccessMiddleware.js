import { SELLER_TYPE } from '#constants/common.js';
import Seller from '#models/Seller.js';
import { failResponse, errorResponse } from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const verifyUnicommerceSellerAccess = async (req, res, next) => {
  try {
    const sellerIds = req.sellerIds;

    /* -------- VALIDATE SELLER IDS -------- */

    if (!Array.isArray(sellerIds)) {
      console.error('Authorization Error: req.sellerIds was not an array. Check preceding middleware.');
      return failResponse(res, 403, {
        message: 'You are not authorized to access seller resources',
      });
    }

    if (sellerIds.length === 0) {
      return failResponse(res, 403, {
        message: 'No seller connected to this user',
      });
    }

    /* -------- FIND NORMAL SELLER -------- */

    const seller = await Seller.findOne({
      _id: { $in: sellerIds },
      type: SELLER_TYPE.NORMAL,
      isDeleted: false,
    }).select('_id');

    if (!seller) {
      return failResponse(res, 403, {
        message: 'User does not have access to a NORMAL seller',
      });
    }

    /* -------- AUTHORIZE -------- */

    req.sellerId = seller._id;

    return next();
  } catch (error) {
    console.error('verifyUnicommerceSellerAccess error:', error);
    return errorResponse(res, 500, {
      message: 'Internal server error during authorization',
    });
  }
};
