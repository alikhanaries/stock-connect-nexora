import Seller from '#models/Seller.js';

const updateSeller = async (id, req) => {
  const { name, status } = req;
  const updatedSeller = await Seller.findByIdAndUpdate(
    { _id: id, isDeleted: false },
    { name, status: status },
    { new: true }
  ).lean();
  return updatedSeller;
};

const deleteSeller = async (id) => {
  const deletedSeller = await Seller.findByIdAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true });
  return deletedSeller;
};

export const updateSellerStatus = async (ids, status) => {
  if (!ids?.length) return 0;
  const result = await Seller.updateMany({ _id: { $in: ids }, status: { $ne: status } }, { $set: { status: status } });
  return result.modifiedCount || 0;
};
export default { updateSeller, deleteSeller, updateSellerStatus };
