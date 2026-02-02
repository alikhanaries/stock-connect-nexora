import { syncFunctions } from '#constants/common.js';
import SyncHistory from '#models/SellerSync.js';
import Seller from '#models/Seller.js';

export const updateSyncDate = async (sellerId, updateSync, upsertCount) => {
  let updateDataOfSync = syncFunctions[updateSync];

  await SyncHistory.create({
    sellerId: sellerId,
    syncType: updateSync,
    itemsSynced: upsertCount >= 0 ? upsertCount : 0,
  });

  await Seller.findByIdAndUpdate(sellerId, {
    $set: { [updateDataOfSync]: new Date() },
  });
};
