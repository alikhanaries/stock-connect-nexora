import Seller from '#models/Seller.js';
import Product from '#models/Product.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { PRODUCT_STATUSES, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import PickupAddress from '#models/PickUpAddress.js';
import { formatSellerResponse } from '#helpers/formatSellerResponse.js';
const createSeller = async (sellerData) => {
  try {
    const { name, ocpSlugId, shopifyConfig } = sellerData;

    const existingSeller = await Seller.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    });

    if (existingSeller && existingSeller.isDeleted === false) {
      return { isExist: true, data: null };
    }

    if (existingSeller && existingSeller.isDeleted === true) {
      const restored = await Seller.findByIdAndUpdate(existingSeller._id, { isDeleted: false, status: 'active' });
      return { isExist: false, data: restored };
    }

    const sellerPayload = {
      isDeleted: false,
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
      Seller.find(filter)
        .select('+shopifyConfig.accessToken')
        .sort(sort)
        .collation({ locale: 'en', strength: 2 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      seller: seller.map(formatSellerResponse),
      pagination: getPagination(totalElements, page, limit),
      appliedFilters,
    };
  } else {
    const seller = await Seller.find(filter)
      .select('+shopifyConfig.accessToken')
      .sort(sort)
      .collation({ locale: 'en', strength: 2 })
      .lean();
    return {
      seller: seller.map(formatSellerResponse),
      appliedFilters,
    };
  }
};

const updateSeller = async (id, payload) => {
  const { name, status, ocpSlugId, shopifyConfig } = payload;

  // 1️ Find seller first
  const seller = await Seller.findOne({ _id: id, isDeleted: false });
  if (!seller) return null; // SELLER NOT FOUND

  let isUpdated = false;
  let nameChanged = false;
  const updateData = {};

  if (name !== undefined && name.trim() !== seller.name) {
    updateData.name = name.trim();
    isUpdated = true;
    nameChanged = true;
  }

  if (status !== undefined && status !== seller.status) {
    updateData.status = status;
    isUpdated = true;
  }

  if (ocpSlugId !== undefined && ocpSlugId.trim() !== seller.ocpSlugId) {
    updateData.ocpSlugId = ocpSlugId.trim();
    isUpdated = true;
  }

  if (shopifyConfig) {
    if (
      shopifyConfig.url !== seller.shopifyConfig?.url ||
      shopifyConfig.apiVersion !== seller.shopifyConfig?.apiVersion ||
      shopifyConfig.accessToken !== seller.shopifyConfig?.accessToken
    ) {
      updateData.shopifyConfig = {
        url: shopifyConfig.url,
        apiVersion: shopifyConfig.apiVersion,
        accessToken: shopifyConfig.accessToken,
      };
      isUpdated = true;
    }
  }

  // 2️ Nothing changed
  if (!isUpdated) {
    return { isUpdated: false };
  }

  // 3️ Update
  const updatedSeller = await Seller.findByIdAndUpdate(id, { $set: updateData }, { new: true });

  // 4️ If seller name changed, propagate it to the brand field of all products under this seller
  if (nameChanged) {
    try {
      await Product.updateMany({ sellerId: id }, { $set: { brand: updateData.name } });
    } catch (err) {
      console.error('Failed to propagate seller name to product brand:', err);
    }
  }

  return { isUpdated: true, seller: updatedSeller };
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
  const seller = await Seller.findOne({
    _id: id,
    isDeleted: false,
  })
    .select('+shopifyConfig.accessToken')
    .lean();

  return formatSellerResponse(seller);
};
export const saveSellerPickUpAdressDetails = async (payload, sellerId) => {
  try {
    const { name, city, address, postcode, country, phone, description, email } = payload;

    // Check mandatory fields
    if (!name || !city || !address || !postcode || !country || !phone || !email) {
      throw new Error('Missing required fields');
    }

    // Check if address already exists for this seller
    const existingAddress = await PickupAddress.findOne({
      sellerId,
      address: new RegExp(`^${address}$`, 'i'), // case-insensitive
    });

    if (existingAddress) {
      throw new Error('Address already exists');
    }

    // Create new pickup address
    const pickupData = {
      name,
      sellerId,
      email,
      city,
      address,
      postcode,
      country,
      phone,
      description,
      status: 'active',
    };

    const savedAddress = await PickupAddress.create(pickupData);

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
    const { address } = payload;

    // Get current record
    const existingData = await PickupAddress.findOne(
      { _id: id, status: { $ne: 'removed' } },
      { sellerId: 1, address: 1, name: 1 }
    );

    if (!existingData) {
      throw new Error('Pickup address not found');
    }

    const sellerId = existingData.sellerId;

    // Only check duplicate if address is being changed
    if (address && address !== existingData.address) {
      const existingAddress = await PickupAddress.findOne({
        sellerId,
        address: new RegExp(`^${address}$`, 'i'), // case-insensitive
        _id: { $ne: id },
      });

      if (existingAddress) {
        throw new Error('Address already exists');
      }
    }

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
export const getSellerPickupAddresses = async (sellerId) => {
  return await PickupAddress.find({ status: 'active', sellerId }).sort({ createdAt: -1 });
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
  getSellerPickupAddresses,
};
