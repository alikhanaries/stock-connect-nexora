import { ERP_SYNC_BRAND_SLUGS } from '#constants/common.js';
import Seller from '#models/Seller.js';
import { entegraPriceSync } from '#root/src/integrations/erp/entegra/service/priceService.js';
import { respirePriceSync } from '#root/src/integrations/erp/respire/service/priceService.js';
import { isRespireConfigured } from '#root/src/integrations/erp/respire/config/config.js';
import { kipPriceSync } from '#root/src/integrations/erp/gurmenKip/services/priceService.js';
import { ramseyPriceSync } from '#root/src/integrations/erp/gurmenRamsey/services/priceService.js';
import { syncShopifyExquisePrice } from '#root/src/integrations/erp/shopify/exquise/service/priceService.js';
import { getShopifyConfig as getExquiseShopifyConfig } from '#root/src/integrations/erp/shopify/exquise/service/shopifyService.js';
import { syncShopifyCatchPrice } from '#root/src/integrations/erp/shopify/catch/service/priceService.js';
import { getShopifyConfig as getCatchShopifyConfig } from '#root/src/integrations/erp/shopify/catch/service/shopifyService.js';
import { syncPriceToChannelEngine } from '#service/priceService.js';
import { sentosPriceSync } from '#root/src/integrations/erp/sentos/services/priceService.js';
import { isSentosConfigured } from '#root/src/integrations/erp/sentos/config/config.js';

const ERP_PRICE_SYNCS = [
  { name: 'entegra', slugs: ERP_SYNC_BRAND_SLUGS.entegra, sync: entegraPriceSync },
  { name: 'gurmen_kip', slugs: ERP_SYNC_BRAND_SLUGS.kip, sync: kipPriceSync },
  { name: 'gurmen_ramsey', slugs: ERP_SYNC_BRAND_SLUGS.ramsey, sync: ramseyPriceSync },
  {
    name: 'exquise',
    slugs: ERP_SYNC_BRAND_SLUGS.exquise,
    sync: syncShopifyExquisePrice,
    getConfig: getExquiseShopifyConfig,
  },
  { name: 'catch', slugs: ERP_SYNC_BRAND_SLUGS.catch, sync: syncShopifyCatchPrice, getConfig: getCatchShopifyConfig },
  {
    name: 'sentos',
    slugs: ERP_SYNC_BRAND_SLUGS.sentos,
    sync: sentosPriceSync,
    skipIfNotConfigured: isSentosConfigured,
  },
  {
    name: 'respire',
    slugs: ERP_SYNC_BRAND_SLUGS.respire,
    sync: respirePriceSync,
    skipIfNotConfigured: isRespireConfigured,
  },
];

const syncSellerPrice = async (erpName, slug, sync, getConfig, skipIfNotConfigured) => {
  try {
    if (skipIfNotConfigured && !skipIfNotConfigured()) {
      console.warn(`[PriceSync] Skipped ${erpName}: integration not configured`);
      return;
    }

    const seller = await Seller.findOne({ slug, isDeleted: false }).select('_id slug');

    if (!seller) {
      console.warn(`[PriceSync] Skipped ${erpName}: no active seller for slug "${slug}"`);
      return;
    }

    // Shopify brands need their per-seller config; ERP brands don't.
    let config;
    if (getConfig) {
      config = await getConfig(seller._id);
      if (!config) {
        console.warn(`[PriceSync] Skipped ${erpName} → "${slug}": incomplete Shopify credentials`);
        return;
      }
    }

    console.log(`[PriceSync] ${erpName} → "${slug}" (${seller._id}) started`);
    await sync(seller._id, config);
    console.log(`[PriceSync] ${erpName} → "${slug}" price synced`);

    try {
      await syncPriceToChannelEngine(seller._id);
      console.log(`[PriceSync] ${erpName} → "${slug}" pushed to Channel Engine`);
    } catch (err) {
      console.error(`[PriceSync] ${erpName} → "${slug}" Channel Engine push failed:`, err.message);
    }
  } catch (err) {
    console.error(`[PriceSync] ${erpName} → "${slug}" failed:`, err.message);
  }
};

let isRunning = false;

export const runPriceSync = async () => {
  if (isRunning) {
    console.warn('[PriceSync] Previous run still in progress — skipping this tick');
    return;
  }

  isRunning = true;
  const startedAt = new Date();
  console.log(`[PriceSync] Sweep started at ${startedAt.toISOString()}`);

  try {
    for (const erp of ERP_PRICE_SYNCS) {
      for (const slug of erp.slugs) {
        try {
          await syncSellerPrice(erp.name, slug, erp.sync, erp.getConfig, erp.skipIfNotConfigured);
        } catch (err) {
          console.error(`[PriceSync] ${erp.name} → "${slug}" failed:`, err.message);
        }
      }
    }
  } finally {
    isRunning = false;
    console.log('[PriceSync] Sweep finished');
  }
};

export default { runPriceSync };
