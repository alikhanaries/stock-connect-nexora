import InventoryStatus from '#models/InventoryStatus.js';
import Inventory from '#models/Inventory.js';
import { buildInventorySkuStatusPipeline } from '../helpers/dashboard.js';

export const getInventorySkuStatus = async () => {
  const pipeline = buildInventorySkuStatusPipeline();
  const batchSize = 1000;
  const cursor = Inventory.aggregate(pipeline).allowDiskUse(true).cursor({ batchSize });

  const ops = [];
  let count = 0;
  let hasDocs = false;
  let cleared = false;

  for await (const doc of cursor) {
    if (!cleared) {
      await InventoryStatus.deleteMany({});
      cleared = true;
    }

    hasDocs = true;
    count += 1;

    ops.push({
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
    });

    if (ops.length === batchSize) {
      await InventoryStatus.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (!hasDocs) {
    await InventoryStatus.deleteMany({});
    return {
      success: true,
      message: 'No data found',
      count: 0,
    };
  }

  if (ops.length) {
    await InventoryStatus.bulkWrite(ops, { ordered: false });
  }
  return {
    success: true,
    message: 'Cache rebuilt successfully',
    count,
  };
};

export default {
  getInventorySkuStatus,
};
