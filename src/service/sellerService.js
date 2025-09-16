import Seller from '#models/Seller.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';

const createSeller = async (sellerData) => {
  const { name } = sellerData;

  const seller = new Seller({ name });
  await seller.save();
  return {
    isExist: false,
    data: seller,
  };
};
const getAllSeller = async (query, creatorId, creatorRole) => {
  const { page = 1, size = 10, search } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const skip = (currentPage - 1) * limit;

  let filter = { isDeleted: false };
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.name = searchRegex;
  }

  if (creatorRole === USER_ROLES.BRAND_SUPER_ADMIN) {
    const sellerLinks = await UserSeller.find({ userId: creatorId }).select('sellerId').lean();
    const sellerId = sellerLinks.map((link) => link.sellerId);
    filter._id = { $in: sellerId };
  }

  const [totalElements, seller] = await Promise.all([
    Seller.countDocuments(filter),
    Seller.find(filter).skip(skip).limit(limit).lean(),
  ]);
  return {
    seller,
    pagination: getPagination(totalElements, currentPage, limit),
  };
};

export default { createSeller, getAllSeller };
