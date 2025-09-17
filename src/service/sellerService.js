import Seller from '#models/Seller.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { PRODUCT_STATUSES, USER_ROLES } from '#constants/common.js';
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
  const { page = 1, size = 10, search, toDate, fromDate, status, sortBy = 'name', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const skip = (currentPage - 1) * limit;

  const appliedFilters = {};

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
  if (fromDate || toDate) {
    filter.createdAt = {};

    if (fromDate) {
      filter.createdAt.$gte = new Date(fromDate);
      appliedFilters.fromDate = fromDate;
    }
    if (toDate) {
      filter.createdAt.$lte = new Date(toDate);
      appliedFilters.toDate = toDate;
    }
  }

  if (status) {
    const statusValue = status.toString().trim().toLowerCase();
    if (PRODUCT_STATUSES.includes(statusValue)) {
      filter.status = statusValue;
      appliedFilters.status = statusValue;
    }
  }

  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };
  const [totalElements, seller] = await Promise.all([
    Seller.countDocuments(filter),
    Seller.find(filter).sort(sort).collation({ locale: 'en', strength: 2 }).skip(skip).limit(limit).lean(),
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

const softDeleteSellers = async (ids) => {
  const deletedSellers = await Seller.updateMany(
    { _id: { $in: ids }, isDeleted: false },
    { $set: { isDeleted: true, status: 'inactive' } }
  );
  return deletedSellers;
};

export const updateSellerStatus = async (ids, status) => {
  if (!ids?.length) return 0;
  const result = await Seller.updateMany({ _id: { $in: ids }, status: { $ne: status } }, { $set: { status: status } });
  return result.modifiedCount || 0;
};

export const getSellerById = async (id) => {
  const user = await Seller.findById({ _id: id, isDeleted: false }).lean();
  return user;
};

export default { createSeller, getAllSeller, updateSeller, softDeleteSellers, updateSellerStatus, getSellerById };
