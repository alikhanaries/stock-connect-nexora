import Responses from '#helpers/response.js';
import Seller from '#models/Seller.js';

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
