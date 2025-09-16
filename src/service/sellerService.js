import Seller from '#models/Seller.js';

const updateSeller = async (id, name, statusValue) => {
  const updatedSeller = await Seller.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { name, status: statusValue },
    { new: true }
  ).lean();
  return updatedSeller;
};

const deleteSeller = async (id) => {
  const deletedSeller = await Seller.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, status: 'inactive' }
  );
  return deletedSeller;
};

export const updateSellerStatus = async (ids, status) => {
  if (!ids?.length) return 0;
  const result = await Seller.updateMany({ _id: { $in: ids }, status: { $ne: status } }, { $set: { status: status } });
  return result.modifiedCount || 0;
};
export default { updateSeller, deleteSeller, updateSellerStatus };
