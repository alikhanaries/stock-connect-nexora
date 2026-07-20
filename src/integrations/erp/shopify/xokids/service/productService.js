import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import Seller from '#root/src/models/Seller.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { formatXokidsShopifyProducts } from '../helpers/formatter.js';
import { fetchXokidsShopifyProducts } from '../utils/fetch.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';
import { skipZeroStockProducts } from '../helpers/skipZeroStockProducts.js';

const { MAX_BATCH_SIZE } = erpCommonConfig;

export const fetchAndStoreShopifyXokidsProducts = async (sellerId, shopifyConfig, requestedBrand) => {
  try {
    const seller = await Seller.findById(sellerId, { slug: 1, name: 1 }).lean();
    if (!seller?.slug) throw new Error(`Seller ${sellerId} not found or missing slug`);
    if (!seller?.name) throw new Error(`Seller ${sellerId} not found or missing name`);

    const targetBrand = requestedBrand || seller.name;
    console.log(
      `[Xokids Shopify Sync] Started sync for seller: ${seller.slug} (${sellerId}), targetBrand: ${targetBrand}`
    );

    // Query Shopify directly by the target brand name
    const shopifySearchQuery = `status:active AND vendor:'${targetBrand}'`;

    console.log(`[Xokids Shopify Sync] Querying Shopify for vendor: "${targetBrand}"`);

    const rawResponse = await fetchXokidsShopifyProducts(shopifyConfig, shopifySearchQuery);
    console.log(`[Xokids Shopify Sync] Fetched ${rawResponse.length} total raw products from Shopify`);

    // Normalize helper: lowercase and remove spaces & special characters (alphanumeric only)
    const normalizeName = (name) => {
      if (!name || typeof name !== 'string') return '';
      return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const normalizedTargetBrand = normalizeName(targetBrand);

    // Filter products based on Shopify response vendor matching the target brand normalized
    const rawResponseFiltered = rawResponse.filter((product) => {
      const normalizedVendor = normalizeName(product.vendor);
      return normalizedVendor === normalizedTargetBrand;
    });
    console.log(
      `[Xokids Shopify Sync] Brand Filter: Kept ${rawResponseFiltered.length} of ${rawResponse.length} products matching brand name "${targetBrand}".`
    );

    let upsertCount = 0;
    const rawProducts = skipZeroStockProducts(rawResponseFiltered);
    console.log(`[Xokids Shopify Sync] ${rawProducts.length} products remaining after filtering out zero stock`);

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      console.log('[Xokids Shopify Sync] No products to sync (zero stock or empty response)');
      return;
    }

    const canonicalProducts = await formatXokidsShopifyProducts(
      rawProducts,
      sellerId,
      seller.slug,
      seller.name,
      MAX_BATCH_SIZE
    );
    console.log(
      `[Xokids Shopify Sync] Generated ${canonicalProducts.length} canonical products (grandparents, parents, children)`
    );

    if (!canonicalProducts.length) {
      console.log('[Xokids Shopify Sync] No canonical products mapped');
      return;
    }

    const categoryTrails = new Set();

    for (const product of canonicalProducts) {
      if (product.categoryTrail) {
        categoryTrails.add(product.categoryTrail);
      }
    }

    const bulkOps = canonicalProducts.map((product) => ({
      updateOne: {
        filter: {
          productSkuCode: product.productSkuCode,
          sellerId,
        },
        update: {
          $set: {
            ...product,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    const BULK_CHUNK_SIZE = 500;
    console.log(
      `[Xokids Shopify Sync] Executing bulk write with ${bulkOps.length} operations in chunks of ${BULK_CHUNK_SIZE}`
    );

    for (let i = 0; i < bulkOps.length; i += BULK_CHUNK_SIZE) {
      const chunk = bulkOps.slice(i, i + BULK_CHUNK_SIZE);
      const data = await Product.bulkWrite(chunk, { ordered: false });
      upsertCount = calculateUpsertCount(upsertCount, data.upsertedCount);
      console.log(
        `[Xokids Shopify Sync] Bulk Chunk processed: matched=${data.matchedCount}, modified=${data.modifiedCount}, upserted=${data.upsertedCount}`
      );
    }

    if (categoryTrails.size > 0) {
      console.log(`[Xokids Shopify Sync] Inserting ${categoryTrails.size} category trails`);
      await insertCategoryTrail([...categoryTrails], sellerId);
    }

    console.log('[Xokids Shopify Sync] Resolving hierarchy status');
    await resolveHierarchyStatus(
      sellerId,
      canonicalProducts.map((p) => p.productSkuCode)
    );

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
    console.log(`[Xokids Shopify Sync] Completed successfully. Total products upserted/registered: ${upsertCount}`);
  } catch (err) {
    console.error('[Xokids Shopify Sync] ERROR:', err);
  }
};
