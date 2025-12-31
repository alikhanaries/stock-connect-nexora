import Seller from '#models/Seller.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { PRODUCT_STATUSES, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import PickupAddress from '#models/PickUpAddress.js';

const createSeller = async (sellerData) => {
  try {
    const { name, ocpSlugId, shopifyConfig } = sellerData;

    const existingSeller = await Seller.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });
    if (existingSeller) {
      return { isExist: true, data: null };
    }

    const sellerPayload = {
      name: name.trim(),
      ocpSlugId:
        ocpSlugId?.trim() ||
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '_'),
    };

    // Attach Shopify config only when fully present
    if (shopifyConfig?.url && shopifyConfig?.apiVersion && shopifyConfig?.accessToken) {
      sellerPayload.shopifyConfig = {
        url: shopifyConfig.url,
        apiVersion: shopifyConfig.apiVersion,
        accessToken: shopifyConfig.accessToken,
      };
    }

    const seller = await Seller.create(sellerPayload);

    return {
      isExist: false,
      data: seller,
    };
  } catch (err) {
    console.error('createSeller error:', err);
    throw err;
  }
};

const getAllSeller = async (query, creatorId, creatorRole) => {
  const isPaginated = query.page ? true : false;
  const { search, toDate, fromDate, status, sortBy = 'name', sortOrder = 'asc' } = query;

  const appliedFilters = {};

  let filter = {
    isDeleted: false,
    type: 'normal',
  };
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.name = searchRegex;
  }

  if (creatorRole === USER_ROLES.SUPER_ADMIN || creatorRole === USER_ROLES.ADMIN) {
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
  if (isPaginated) {
    const page = Math.max(1, Number(query.page));
    const limit = Math.max(1, Number(query.size || 10));
    const skip = (page - 1) * limit;

    const [totalElements, seller] = await Promise.all([
      Seller.countDocuments(filter),
      Seller.find(filter).sort(sort).collation({ locale: 'en', strength: 2 }).skip(skip).limit(limit).lean(),
    ]);

    return {
      seller,
      pagination: getPagination(totalElements, page, limit),
      appliedFilters,
    };
  } else {
    const seller = await Seller.find(filter).sort(sort).collation({ locale: 'en', strength: 2 }).lean();
    return {
      seller,
      appliedFilters,
    };
  }
};

const updateSeller = async (id, name, statusValue, ocpSlugId) => {
  const updateData = {};
  if (name) updateData.name = name;
  if (statusValue) updateData.status = statusValue;
  if (ocpSlugId) updateData.ocpSlugId = ocpSlugId;

  if (Object.keys(updateData).length === 0) return null;
  const updatedSeller = await Seller.findOneAndUpdate({ _id: id, isDeleted: false }, updateData, { new: true }).lean();
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
export const saveSellerPickUpAdressDetails = async (payload) => {
  try {
    const { city, address, postcode, country, phone, description, email } = payload;

    // Check mandatory fields
    if (!city || !address || !postcode || !country || !phone || !email) {
      throw new Error('Missing required fields');
    }

    // Prepare pickup address data
    const pickupData = {
      email,
      city,
      address,
      postcode,
      country,
      phone,
      description,
      status: 'active',
    };

    // Use sellerId + address as unique key to decide update vs insert
    const filter = { address: address };

    const savedAddress = await PickupAddress.findOneAndUpdate(
      filter,
      { $set: pickupData },
      { new: true, upsert: true } // update if exists, insert if not
    );

    return savedAddress;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const getAllPickupAddresses = async () => {
  return await PickupAddress.find({ status: 'active' }).sort({ createdAt: -1 });
};

// Update a pickup address
export const updatePickupAddress = async (id, payload) => {
  try {
    const updatedAddress = await PickupAddress.findOneAndUpdate(
      { _id: id, status: { $ne: 'removed' } },
      { $set: payload },
      { new: true, runValidators: true }
    );
    return updatedAddress;
  } catch (error) {
    throw new Error(error.message);
  }
};

// Delete a pickup address (soft delete)
export const deletePickupAddress = async (id) => {
  try {
    const deleted = await PickupAddress.findByIdAndUpdate(
      id,
      { $set: { status: 'removed' } },
      { new: true, runValidators: true }
    );
    return deleted;
  } catch (error) {
    throw new Error(error.message);
  }
};

export default {
  createSeller,
  getAllSeller,
  updateSeller,
  softDeleteSellers,
  updateSellerStatus,
  getSellerById,
  saveSellerPickUpAdressDetails,
  getAllPickupAddresses,
  updatePickupAddress,
  deletePickupAddress,
};
