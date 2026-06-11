import { ERP_SYNC_BRAND_SLUGS } from '#constants/common.js';
import Seller from '#models/Seller.js';
import { entegraPriceSync } from '#root/src/integrations/erp/entegra/service/priceService.js';
import { kipPriceSync } from '#root/src/integrations/erp/gurmenKip/services/priceService.js';
import { ramseyPriceSync } from '#root/src/integrations/erp/gurmenRamsey/services/priceService.js';
import { syncPriceToChannelEngine } from '#service/priceService.js';

const ERP_PRICE_SYNCS = [
  { name: 'entegra', slugs: ERP_SYNC_BRAND_SLUGS.entegra, sync: entegraPriceSync },
  { name: 'gurmen_kip', slugs: ERP_SYNC_BRAND_SLUGS.kip, sync: kipPriceSync },
  { name: 'gurmen_ramsey', slugs: ERP_SYNC_BRAND_SLUGS.ramsey, sync: ramseyPriceSync },
];

const syncSellerPrice = async (erpName, slug, sync) => {
  try {
    const seller = await Seller.findOne({ slug, isDeleted: false }).select('_id slug');

    if (!seller) {
      console.warn(`[PriceSync] Skipped ${erpName}: no active seller for slug "${slug}"`);
      return;
    }

    console.log(`[PriceSync] ${erpName} → "${slug}" (${seller._id}) started`);
    await sync(seller._id);
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
          await syncSellerPrice(erp.name, slug, erp.sync);
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
