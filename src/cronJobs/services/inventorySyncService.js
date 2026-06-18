import { ERP_SYNC_BRAND_SLUGS } from '#constants/common.js';
import Seller from '#models/Seller.js';
import { entegraInventorySync } from '#root/src/integrations/erp/entegra/service/inventoryService.js';
import { kipInventorySync } from '#root/src/integrations/erp/gurmenKip/services/inventoryService.js';
import { RamseyInventorySync } from '#root/src/integrations/erp/gurmenRamsey/services/inventoryService.js';
import { xokidsInventorySync } from '#root/src/integrations/erp/xokids/services/inventoryService.js';
import { syncShopifyExquiseInventory } from '#root/src/integrations/erp/shopify/exquise/service/inventoryService.js';
import { getShopifyConfig as getExquiseShopifyConfig } from '#root/src/integrations/erp/shopify/exquise/service/shopifyService.js';
import { syncShopifyCatchInventory } from '#root/src/integrations/erp/shopify/catch/service/inventoryService.js';
import { getShopifyConfig as getCatchShopifyConfig } from '#root/src/integrations/erp/shopify/catch/service/shopifyService.js';
import { syncStockToChannelEngine } from '#service/InventoryService.js';

const ERP_INVENTORY_SYNCS = [
  { name: 'entegra', slugs: ERP_SYNC_BRAND_SLUGS.entegra, sync: entegraInventorySync },
  { name: 'xokids', slugs: ERP_SYNC_BRAND_SLUGS.xokids, sync: xokidsInventorySync },
  { name: 'gurmen_kip', slugs: ERP_SYNC_BRAND_SLUGS.kip, sync: kipInventorySync },
  { name: 'gurmen_ramsey', slugs: ERP_SYNC_BRAND_SLUGS.ramsey, sync: RamseyInventorySync },
  {
    name: 'exquise',
    slugs: ERP_SYNC_BRAND_SLUGS.exquise,
    sync: syncShopifyExquiseInventory,
    getConfig: getExquiseShopifyConfig,
  },
  {
    name: 'catch',
    slugs: ERP_SYNC_BRAND_SLUGS.catch,
    sync: syncShopifyCatchInventory,
    getConfig: getCatchShopifyConfig,
  },
];

const syncSellerInventory = async (erpName, slug, sync, getConfig) => {
  try {
    const seller = await Seller.findOne({ slug, isDeleted: false }).select('_id slug');

    if (!seller) {
      console.warn(`[InventorySync] Skipped ${erpName}: no active seller for slug "${slug}"`);
      return;
    }

    let config;
    if (getConfig) {
      config = await getConfig(seller._id);
      if (!config) {
        console.warn(`[InventorySync] Skipped ${erpName} → "${slug}": incomplete Shopify credentials`);
        return;
      }
    }

    console.log(`[InventorySync] ${erpName} → "${slug}" (${seller._id}) started`);
    await sync(seller._id, config);
    console.log(`[InventorySync] ${erpName} → "${slug}" inventory synced`);

    try {
      await syncStockToChannelEngine(seller._id);
      console.log(`[InventorySync] ${erpName} → "${slug}" pushed to Channel Engine`);
    } catch (err) {
      console.error(`[InventorySync] ${erpName} → "${slug}" Channel Engine push failed:`, err.message);
    }
  } catch (err) {
    console.error(`[InventorySync] ${erpName} → "${slug}" failed:`, err.message);
  }
};

let isRunning = false;

export const runInventorySync = async () => {
  if (isRunning) {
    console.warn('[InventorySync] Previous run still in progress — skipping this tick');
    return;
  }

  isRunning = true;
  const startedAt = new Date();
  console.log(`[InventorySync] Sweep started at ${startedAt.toISOString()}`);

  try {
    for (const erp of ERP_INVENTORY_SYNCS) {
      for (const slug of erp.slugs) {
        try {
          await syncSellerInventory(erp.name, slug, erp.sync, erp.getConfig);
        } catch (err) {
          console.error(`[InventorySync] ${erp.name} → "${slug}" failed:`, err.message);
        }
      }
    }
  } finally {
    isRunning = false;
    console.log('[InventorySync] Sweep finished');
  }
};

export default { runInventorySync };
