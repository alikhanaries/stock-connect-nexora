import Product from '#root/src/models/Product.js';
import Price from '#root/src/models/Price.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { fetchXokidsShopifyProducts } from '../utils/fetch.js';
import { formatXokidsShopifyProducts } from '../helpers/formatter.js';
import Seller from '#root/src/models/Seller.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => sku?.trim().toUpperCase();

export const syncShopifyXokidsPrice = async (sellerId, shopifyConfig, requestedBrand) => {
  try {
    const seller = await Seller.findById(sellerId, { slug: 1, name: 1 }).lean();
    if (!seller?.slug) throw new Error(`Seller ${sellerId} not found or missing slug`);
    if (!seller?.name) throw new Error(`Seller ${sellerId} not found or missing name`);

    const targetBrand = requestedBrand || seller.name;
    console.log(
      `[Xokids Price Sync] Started sync for seller: ${seller.slug} (${sellerId}), targetBrand: ${targetBrand}`
    );

    // Query Shopify directly by the target brand name
    const shopifySearchQuery = `status:active AND vendor:'${targetBrand}'`;

    console.log(`[Xokids Price Sync] Querying Shopify for vendor: "${targetBrand}"`);

    const rawResponse = await fetchXokidsShopifyProducts(shopifyConfig, shopifySearchQuery);
    console.log(`[Xokids Price Sync] Fetched ${rawResponse.length} total raw products from Shopify`);

    const normalizeName = (name) => {
      if (!name || typeof name !== 'string') return '';
      return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const normalizedTargetBrand = normalizeName(targetBrand);

    // Filter products based on Shopify response vendor matching the target brand normalized
    const rawProducts = rawResponse.filter((product) => {
      const normalizedVendor = normalizeName(product.vendor);
      return normalizedVendor === normalizedTargetBrand;
    });
    console.log(
      `[Xokids Price Sync] Brand Filter: Kept ${rawProducts.length} of ${rawResponse.length} products matching brand name "${targetBrand}".`
    );

    if (!Array.isArray(rawProducts) || !rawProducts.length) {
      return { message: 'No products returned from Shopify' };
    }

    const canonicalProducts = await formatXokidsShopifyProducts(
      rawProducts,
      sellerId,
      seller.slug,
      seller.name,
      MAX_BATCH_SIZE
    );

    if (!canonicalProducts.length) {
      return { message: 'No canonical products generated' };
    }

    let updatedCount = 0;

    await processInBatches(
      canonicalProducts,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;

        const skuList = batch.map((p) => normalize(p.productSkuCode));

        const existingProducts = await Product.find(
          { sellerId, productSkuCode: { $in: skuList } },
          { _id: 1, productSkuCode: 1 }
        ).lean();

        const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

        const now = new Date();
        const productOps = [];
        const priceOps = [];

        for (const p of batch) {
          const existing = productMap.get(normalize(p.productSkuCode));
          if (!existing) continue;

          productOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: p.productSkuCode },
              update: {
                $set: {
                  price: p.price,
                  noonPrice: p.noonPrice,
                  namshiPrice: p.namshiPrice,
                  purchasePrice: p.purchasePrice,
                  msrp: p.msrp,
                  updatedAt: now,
                },
              },
            },
          });

          priceOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: p.productSkuCode },
              update: {
                $set: {
                  price: p.price,
                  noonPrice: p.noonPrice,
                  namshiPrice: p.namshiPrice,
                  purchasePrice: p.purchasePrice,
                  msrp: p.msrp,
                  updatedAt: now,
                  lastSyncedAt: now,
                },
                $setOnInsert: {
                  sellerId,
                  productId: existing._id,
                  productSkuCode: p.productSkuCode,
                  createdAt: now,
                },
              },
              upsert: true,
            },
          });
        }

        if (productOps.length) {
          const result = await Product.bulkWrite(productOps, { ordered: false });
          await Price.bulkWrite(priceOps, { ordered: false });
          updatedCount += result.matchedCount;

          console.log(`[Xokids Price Sync][Batch ${batchId}] Updated: ${result.modifiedCount}`);
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'PRICE', updatedCount);
    console.log(`[Xokids Price Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Xokids Price Sync] Failed:', error);
    throw error;
  }
};
