import { ROLES_BASED_USER_CREATION, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import Seller from '#models/Seller.js';

const userRoleBasedAccess = (creatorRole, newUserRole) => {
  return ROLES_BASED_USER_CREATION[creatorRole]?.includes(newUserRole) || false;
};

const validateSellerAccessForCreator = async (creatorId, selectedSeller, creatorRole) => {
  if (USER_ROLES.SUPER_ADMIN === creatorRole) {
    const linkExists = await UserSeller.countDocuments({
      userId: creatorId,
      sellerId: selectedSeller,
    });
    return { success: linkExists > 0, role: creatorRole };
  } else if (USER_ROLES.MASTER_ADMIN === creatorRole) {
    const sellerExists = await Seller.countDocuments({
      _id: selectedSeller,
      isDeleted: false,
    });

    return { success: sellerExists > 0, role: creatorRole };
  } else {
    return false;
  }
};

const getSellerId = async (userId) => {
  const link = await UserSeller.findOne({ userId: userId }).select('sellerId').lean();
  if (!link) {
    return null;
  }
  return link.sellerId.toString();
};

export default { userRoleBasedAccess, validateSellerAccessForCreator, getSellerId };
