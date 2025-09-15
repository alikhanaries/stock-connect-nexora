import response from '#helpers/response.js';
import sellerService from '#service/sellerService.js';

export const createSeller = async (req, res) => {
  try {
    const newSeller = await sellerService.createSeller(req.body);
    if (!newSeller) {
      return response.failResponse(res, 'Unable to create Seller', 409);
    }
    return response.successResponse(res, 'Seller created successfully', 201, newSeller.data);
  } catch (error) {
    console.error('Error creating seller:', error);
    return response.errorResponse(res, error, 500);
  }
};
export const getAllSeller = async (req, res) => {
  try {
    const creatorRole = req.user.role;
    const creatorId = req.user._id;
    const { seller, pagination } = await sellerService.getAllSeller(req.query, creatorId, creatorRole);
    const responseData = {
      content: seller || [],
      ...pagination,
    };
    const message = seller.length ? 'Seller fetched successfully' : 'No Seller found';

    return response.successResponse(res, message, 200, responseData);
  } catch (error) {
    return response.errorResponse(res, error, 500);
  }
};
