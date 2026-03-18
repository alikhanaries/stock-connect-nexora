import User from '#models/User.js';
import UserSeller from '#models/UserSeller.js';

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
const deleteSelectedUsers = async (ids, locale, sellerId) => {
  try {
    const connections = await UserSeller.find({
      sellerId: sellerId,
      userId: { $in: ids },
    }).select('userId');
    const idsToDelete = connections.map((con) => con.userId);

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
    return result;
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

const deleteUserId = async (id, sellerId) => {
  try {
    const userToDelete = await UserSeller.findOne({
      sellerId: sellerId,
      userId: id,
    });

    if (!userToDelete) {
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
