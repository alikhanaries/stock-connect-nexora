import User from '#models/User.js';

const deleteAllUsers = async () => {
  try {
    await User.updateMany({ isDeleted: false }, { $set: { isDeleted: true } });
    return {
      success: true,
    };
  } catch (err) {
    console.error('Error :', err.message);
    return { success: false, message: err.message };
  }
};
const deleteSelectedUsers = async (ids) => {
  try {
    const existingUsers = await User.find({ _id: { $in: ids }, isDeleted: false }, { _id: 1 });
    if (existingUsers.length === 0) {
      return { success: false, message: 'No matching users found to delete.' };
    }
    const idsToDelete = existingUsers.map((user) => user._id);

    const result = await User.updateMany(
      {
        _id: { $in: idsToDelete },
        isDeleted: false,
      },
      { $set: { isDeleted: true } }
    );
    return result;
  } catch (err) {
    console.error('Error :', err.message);
    return { success: false, message: err.message };
  }
};
const updateSelectedUserStatus = async (ids, active) => {
  const existingUsers = await User.find({ _id: { $in: ids }, isDeleted: false }, { _id: 1 });

  if (existingUsers.length === 0) {
    return { success: false, message: 'No matching users found to Update.' };
  }
  const idsToUpdate = existingUsers.map((user) => user._id);

  const result = await User.updateMany(
    {
      _id: { $in: idsToUpdate },
      isDeleted: false,
    },
    { $set: { active: active } }
  );
  return result;
};
export default { deleteAllUsers, deleteSelectedUsers, updateSelectedUserStatus };
