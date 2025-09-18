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

  if (creatorRole === USER_ROLES.SUPER_ADMIN) {
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

const updateSeller = async (id, name, statusValue) => {
  const updatedSeller = await Seller.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { name, status: statusValue },
    { new: true }
  ).lean();
  return updatedSeller;
};

const deleteSeller = async (id) => {
  const deletedSeller = await Seller.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, status: 'inactive' }
  );
  return deletedSeller;
};

export const updateSellerStatus = async (ids, status) => {
  if (!ids?.length) return 0;
  const result = await Seller.updateMany({ _id: { $in: ids }, status: { $ne: status } }, { $set: { status: status } });
  return result.modifiedCount || 0;
};

export default { createSeller, getAllSeller, updateSeller, deleteSeller, updateSellerStatus };
