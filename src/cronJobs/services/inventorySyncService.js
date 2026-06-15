import Seller from '#root/src/models/Seller.js';
import { INVENTORY_SYNC_CRON_SELLERS } from '#constants/common.js';
import { syncShopifyExquiseInventory } from '../../integrations/erp/shopify/exquise/service/inventoryService.js';
import { getShopifyConfig } from '../../integrations/erp/shopify/exquise/service/shopifyService.js';
import { syncStockToChannelEngine } from '#service/InventoryService.js';

const brandSyncHandlers = {
  exquise: syncShopifyExquiseInventory,
};

const syncInventory = async (slug) => {
  const sync = brandSyncHandlers[slug];

  if (!sync) {
    console.error(`Inventory sync skipped: no handler registered for "${slug}"`);
    return;
  }

  const seller = await Seller.findOne({ slug, isDeleted: false }).select('_id');

  if (!seller) {
    console.error(`Inventory sync skipped: seller "${slug}" not found`);
    return;
  }

  const shopifyConfig = await getShopifyConfig(seller._id);

  if (!shopifyConfig) {
    console.error(`Inventory sync skipped for "${slug}": incomplete Shopify credentials`);
    return;
  }

  await sync(seller._id, shopifyConfig);

  try {
    await syncStockToChannelEngine(seller._id);
  } catch (err) {
    console.error(`Channel Engine stock sync failed for "${slug}":`, err.message);
  }
};

export const runInventorySync = async () => {
  for (const slug of INVENTORY_SYNC_CRON_SELLERS) {
    try {
      await syncInventory(slug);
    } catch (err) {
      console.error(`Inventory sync failed for "${slug}":`, err.message);
    }
  }
};
