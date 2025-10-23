import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { processInBatches } from './batchHelper.js';

export const formatNebimProducts = async (raw = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(raw)) return [];
  return await processInBatches(raw, batchSize, (item) => canonicalProductMapper(item, sellerId));
};
