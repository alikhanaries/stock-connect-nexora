import InventoryStatus from '#models/InventoryStatus.js';
import Inventory from '#models/Inventory.js';
import { buildInventorySkuStatusPipeline } from '../helpers/dashboard.js';

export const getInventorySkuStatus = async () => {
  const pipeline = buildInventorySkuStatusPipeline();
  const docs = await Inventory.aggregate(pipeline).allowDiskUse(true);
  if (!docs.length) {
    return {
      success: true,
      message: 'No data found',
      count: 0,
    };
  }
  await InventoryStatus.deleteMany({});
  const batchSize = 1000;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);

    const ops = batch.map((doc) => ({
      updateOne: {
        filter: {
          sellerId: doc.sellerId,
          productSkuCode: doc.productSkuCode,
          channelId: doc.channelId,
        },
        update: {
          $set: {
            sellerId: doc.sellerId,
            productSkuCode: doc.productSkuCode,
            channelId: doc.channelId,
            status: doc.status ?? null,
            isFrozen: typeof doc.isFrozen === 'boolean' ? doc.isFrozen : null,
            updatedAt: doc.updatedAt,
          },
        },
        upsert: true,
      },
    }));
    await InventoryStatus.bulkWrite(ops, { ordered: false });
  }
  return {
    success: true,
    message: 'Cache rebuilt successfully',
    count: docs.length,
  };
};

export default {
  getInventorySkuStatus,
};
