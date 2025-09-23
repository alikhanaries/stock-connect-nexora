import { ROLES_BASED_USER_CREATION, SELLER_TYPE, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import Seller from '#models/Seller.js';
import User from '../models/User.js';

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

const userAndSellerConnection = async (role, sellerId, newUserData) => {
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
    userId: newUserData._id,
    sellerId: finalSellerId,
  });

  await userSellerConnection.save();
  return userSellerConnection;
};
const validateUserId = async (userId) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select('role').lean();
  return user;
};

export default {
  userRoleBasedAccess,
  validateSellerAccessForCreator,
  getSellerIds,
  userAndSellerConnection,
  validateUserId,
};
