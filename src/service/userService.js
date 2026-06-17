import User from '#models/User.js';
import UserSeller from '#models/UserSeller.js';
import { USER_ROLES } from '#constants/common.js';

const deleteAllUsers = async () => {
  try {
    await User.updateMany({ isDeleted: false }, { $set: { isDeleted: true, active: false } });
    return {
      success: true,
    };
  } catch (err) {
    console.error('Error :', err.message);
    throw err;
  }
};
const deleteSelectedUsers = async (ids, locale, sellerId, currentUserRole, currentUserId) => {
  try {
    const usersToConsider = await User.find({ _id: { $in: ids }, isDeleted: false }, '_id role');

    let idsToDelete = [];

    for (const user of usersToConsider) {
      if (currentUserId.toString() === user._id.toString()) {
        continue;
      }

      if (user.role === USER_ROLES.MASTER_ADMIN) {
        if (currentUserRole === USER_ROLES.MASTER_ADMIN) {
          idsToDelete.push(user._id);
        }
      } else {
        if (sellerId) {
          const connection = await UserSeller.findOne({
            sellerId: sellerId,
            userId: user._id,
          });
          if (connection) {
            idsToDelete.push(user._id);
          }
        }
      }
    }

    if (idsToDelete.length === 0) {
      return { success: false, message: locale.INVALID_USER_IDS_TO_DELETE };
    }

    const result = await User.updateMany(
      {
        _id: { $in: idsToDelete },
        isDeleted: false,
      },
      { $set: { isDeleted: true, active: false } }
    );
    return { success: true, modifiedCount: result.modifiedCount };
  } catch (err) {
    console.error('Error :', err.message);
    throw err;
  }
};

const updateSelectedUserStatus = async (ids, active, sellerId, locale) => {
  const connections = await UserSeller.find({
    sellerId: sellerId,
    userId: { $in: ids },
  }).select('userId');
  const validUserIds = connections.map((conn) => conn.userId.toString());

  if (validUserIds.length === 0) {
    return {
      success: false,
      message: locale.NO_VALID_USERS_FOUND,
    };
  }
  const result = await User.updateMany(
    {
      _id: { $in: validUserIds },
      isDeleted: false,
    },
    { $set: { active: active } }
  );
  return result;
};

const deleteUserId = async (id, sellerId, currentUserRole, currentUserId) => {
  try {
    const userToConsider = await User.findOne({ _id: id, isDeleted: false }, '_id role');

    if (!userToConsider) {
      return null;
    }

    let canDelete = false;

    if (currentUserId.toString() === userToConsider._id.toString()) {
      return null;
    }

    if (userToConsider.role === USER_ROLES.MASTER_ADMIN) {
      if (currentUserRole === USER_ROLES.MASTER_ADMIN) {
        canDelete = true;
      }
    } else {
      if (sellerId) {
        const connection = await UserSeller.findOne({
          sellerId: sellerId,
          userId: id,
        });
        if (connection) {
          canDelete = true;
        }
      }
    }

    if (!canDelete) {
      return null;
    }

    const deletedUser = await User.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, active: false } },
      { new: true }
    );
    return deletedUser;
  } catch (err) {
    console.error('Error :', err.message);
    throw err;
  }
};
export default { deleteAllUsers, deleteSelectedUsers, deleteUserId, updateSelectedUserStatus };
