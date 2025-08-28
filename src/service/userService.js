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
    const result = await User.updateMany(
      {
        _id: { $in: ids },
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
export default { deleteAllUsers, deleteSelectedUsers };
