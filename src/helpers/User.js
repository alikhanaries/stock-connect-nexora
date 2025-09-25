import { ROLES_BASED_USER_CREATION, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import Seller from '#models/Seller.js';

const userRoleBasedAccess = (creatorRole, newUserRole) => {
  return ROLES_BASED_USER_CREATION[creatorRole]?.includes(newUserRole) || false;
};

const validateSellerAccessForCreator = async (creatorId, selectedSeller, creatorRole) => {
  const baseSeller = await Seller.findById(selectedSeller);
  if (!baseSeller) {
    return { success: false, notBaseSeller: true };
  }

  if (baseSeller.type === SELLER_TYPE.BASE) {
    return { success: false, notBaseSeller: false };
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
    const masterSeller = await Seller.findOne({ type: SELLER_TYPE.BASE });

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

const getUserConnectedToThisSellers = async (seller) => {
  if (seller[0].type === SELLER_TYPE.BASE) {
    return {
      type: seller[0].type,
      userIds: null,
    };
  }
  const sellerIds = seller.map((s) => s._id.toString());
  const userSellerConnection = await UserSeller.find({ sellerId: { $in: sellerIds } })
    .select('userId')
    .lean();

  const userIds = userSellerConnection.map((u) => u.userId);
  return {
    type: SELLER_TYPE.NORMAL,
    userIds: userIds,
  };
};

const sellerConnectionUpdate = async (userId, sellerId) => {
  const connectionUpdate = await UserSeller.findOneAndUpdate(
    { userId: userId },
    { sellerId: sellerId },
    { upsert: true, new: true }
  );
  return connectionUpdate;
};

export default {
  userRoleBasedAccess,
  validateSellerAccessForCreator,
  getSellerIds,
  userAndSellerConnection,
  getUserConnectedToThisSellers,
  sellerConnectionUpdate,
};
