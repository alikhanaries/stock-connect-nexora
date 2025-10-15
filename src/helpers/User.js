import { ROLES_BASED_USER_CREATION, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import Seller from '#models/Seller.js';

const userRoleBasedAccess = (creatorRole, newUserRole) => {
  return ROLES_BASED_USER_CREATION[creatorRole]?.includes(newUserRole) || false;
};

const validateSellerAccessForCreator = async (creatorId, selectedSeller, creatorRole, newUserRole) => {
  const baseSeller = await Seller.findById(selectedSeller);
  if (!baseSeller) {
    return { success: false, notBaseSeller: true };
  }

  if (ROLES_BASED_USER_CREATION[USER_ROLES.SUPER_ADMIN]?.includes(newUserRole)) {
    if (baseSeller.type === SELLER_TYPE.BASE) {
      return { success: false, notBaseSeller: false };
    }
  }

  if (USER_ROLES.SUPER_ADMIN === creatorRole) {
    const linkExists = await UserSeller.countDocuments({
      userId: creatorId,
      sellerId: selectedSeller,
    });
    return { success: linkExists > 0, role: creatorRole, notBaseSeller: true };
  } else if (USER_ROLES.MASTER_ADMIN === creatorRole) {
    const sellerExists = await Seller.countDocuments({
      _id: selectedSeller,
      isDeleted: false,
    });

    return { success: sellerExists > 0, role: creatorRole, notBaseSeller: true };
  } else {
    return { success: false, role: creatorRole, notBaseSeller: true };
  }
};

const getSellerIds = async (id) => {
  const link = await UserSeller.find({ userId: id }).select('sellerId').lean();
  const sellerIds = link.map((ids) => ids.sellerId.toString());
  return sellerIds;
};

const userAndSellerConnection = async (role, sellerId, newUserId) => {
  let finalSellerId;

  if (role === USER_ROLES.MASTER_ADMIN) {
    const masterSeller = await Seller.findOne({ type: SELLER_TYPE.BASE }).lean();

    if (!masterSeller) {
      throw new Error('Cannot create MASTER_ADMIN: No "base" seller found in the database.');
    }

    finalSellerId = masterSeller._id;
  } else {
    finalSellerId = sellerId;
  }

  const userSellerConnection = new UserSeller({
    userId: newUserId,
    sellerId: finalSellerId,
  });

  await userSellerConnection.save();
  return userSellerConnection;
};

const getUserConnectedToThisSellers = async (seller, role, baseSellerId) => {
  let userSellerConnection;
  if (role === USER_ROLES.MASTER_ADMIN) {
    const sellerIds = [seller._id, baseSellerId];
    userSellerConnection = await UserSeller.find({ sellerId: { $in: sellerIds } })
      .select('userId')
      .lean();
  } else {
    userSellerConnection = await UserSeller.find({ sellerId: seller._id }).select('userId').lean();
  }

  const userIds = userSellerConnection.map((u) => u.userId);
  return userIds;
};
const sellerConnectionUpdate = async (userId, sellerIds) => {
  await UserSeller.deleteMany({ userId: userId });

  if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
    return [];
  }

  const connectionsToCreate = sellerIds.map((sId) => ({
    userId: userId,
    sellerId: sId,
  }));

  const connectionUpdate = await UserSeller.insertMany(connectionsToCreate);

  const resSellerIds = connectionUpdate.map((doc) => doc.sellerId);
  return resSellerIds;
};

const getConnectedSllerId = async (userId) => {
  const doc = await UserSeller.find({ userId }, { sellerId: 1, _id: 0 }).lean();

  const sellerIds = doc.map((doc) => doc.sellerId);
  return sellerIds;
};

export default {
  userRoleBasedAccess,
  validateSellerAccessForCreator,
  getSellerIds,
  userAndSellerConnection,
  getUserConnectedToThisSellers,
  sellerConnectionUpdate,
  getConnectedSllerId,
};
