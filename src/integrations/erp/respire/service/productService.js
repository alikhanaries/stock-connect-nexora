import Product from '#models/Product.js';
import Seller from '#models/Seller.js';
import { respireConfig } from '#root/src/integrations/erp/respire/config/config.js';
import { filterSyncableProducts } from '../helpers/filterSyncableProducts.js';
import { mapProductToDB } from '../helpers/formatter.js';
import { rollUpGrandParentStock } from '../helpers/rollUpGrandParentStock.js';
import { fetchCategories } from './categoryService.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
const BASE_URL = `${respireConfig?.RESPIRE_BASE_URL}product/page=`;

/**
 * Fetch one page from remote API
 */
const FETCH_TIMEOUT = 45000; // 45 sec (important for slow pages)
const MAX_RETRIES = 5; // more reliable for large imports

export const fetchProductsPage = async (page = 1, AUTH_TOKEN) => {
  const url = `${BASE_URL}${page}/`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Create a fresh AbortController **each attempt**
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: AUTH_TOKEN,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle HTTP errors
      if (!res.ok) {
        const body = await res.text().catch(() => 'Invalid body');
        throw new Error(`API error: ${res.status} ${res.statusText} | Response: ${body}`);
      }

      // Parse JSON safely
      let json;
      try {
        json = await res.json();
      } catch (parseErr) {
        throw new Error(`Invalid JSON returned by API: ${parseErr.message}`);
      }

      if (!json || typeof json !== 'object') {
        throw new Error('API returned empty or malformed JSON');
      }

      // Optional: add a small delay to avoid rate-limit
      await new Promise((r) => setTimeout(r, 200));

      return json; // SUCCESS ✔
    } catch (err) {
      console.error(` Fetch failed (Attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);

      if (attempt >= MAX_RETRIES) {
        throw new Error(`fetchProductsPage(${page}) failed after ${MAX_RETRIES} attempts`);
      }

      // Exponential retry wait
      const wait = attempt * 1000;
      console.log(` Retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
};

/**
 * Fetch all pages & save products
 */
export const importAllProducts = async (sellerId, isImageUpdate = true) => {
  const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
  if (!seller?.slug) throw new Error(`Seller ${sellerId} not found or missing slug`);

  const AUTH_TOKEN = await getAccessToken();

  let page = 1;
  let totalImported = 0;
  const categories = await fetchCategories(AUTH_TOKEN);
  while (true) {
    let result;

    try {
      result = await fetchProductsPage(page, AUTH_TOKEN);
    } catch (err) {
      console.error(` Failed to fetch page ${page}:`, err.message);
      break;
    }

    // Validate response format
    const rawList = result?.productList;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      console.log(' No more products. Import completed.');
      break;
    }

    // Single-tenant account: every product returned belongs to this seller
    // Skip whole products with no working image, and variants without stock/color/size
    const { products: list, skipped } = await filterSyncableProducts(rawList);
    console.log(
      ` [Respire] Page ${page}: ${list.length}/${rawList.length} products to sync | skipped -> ` +
        `no working image: ${skipped.noWorkingImage}, no stock/color/size: ${skipped.noStockColorSize}, ` +
        `no variants: ${skipped.noVariants}`
    );

    let importedThisPage = 0;

    for (const product of list) {
      try {
        await createOrUpdateProduct(sellerId, product, categories, isImageUpdate);
        importedThisPage++;
        totalImported++;
      } catch (err) {
        console.error(`Error saving product ${product.productCode ?? 'unknown'}:`, err.message);
      }
    }
    console.log(` [Respire] Imported ${importedThisPage} products from page ${page}`);

    // Go to next page
    page++;
  }

  console.log(` [Respire] Total products imported: ${totalImported}`);
  await updateSyncDate(sellerId, 'PRODUCT', totalImported);
  return totalImported;
};

const upsertProducts = (items = []) =>
  Promise.all(
    items.map((item) =>
      Product.findOneAndUpdate(
        { productSkuCode: item.productSkuCode },
        {
          $set: {
            ...item,
            updatedAt: new Date(), // always update
          },
          $setOnInsert: {
            createdAt: new Date(), // only on insert
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      )
    )
  );

// True when every SKU already has images saved, so a sync with isImageUpdate=false can
// safely skip them. New products (or ones whose images never got stored) return false.
const allHaveStoredImages = async (sellerId, skus = []) => {
  if (!skus.length) return true;
  const withImages = await Product.countDocuments({
    sellerId,
    productSkuCode: { $in: skus },
    'images.0': { $exists: true },
  });
  return withImages === skus.length;
};

/**
 * Create Product + Variants (grandparent -> color parent -> size child)
 */

export const createOrUpdateProduct = async (sellerId, product, categories, isImageUpdate = true) => {
  const categoryId = product.group; // e.g., '4'
  const categoryTrail = categoryId ? categories.find((cat) => cat.id == categoryId)?.name || '' : '';

  // ---------------------------------------------
  // Map product to DB structure
  // ---------------------------------------------
  let mapped = await mapProductToDB(sellerId, product, categoryTrail, isImageUpdate);

  // isImageUpdate=false only means "don't re-store images we already have" — products
  // that have no images yet still get them on this sync.
  if (!isImageUpdate) {
    const skus = [...mapped.grandParents, ...mapped.parents, ...mapped.children].map((p) => p.productSkuCode);
    if (!(await allHaveStoredImages(sellerId, skus))) {
      mapped = await mapProductToDB(sellerId, product, categoryTrail, true);
    }
  }

  const { grandParents, parents, children } = mapped;

  // Upsert top-down so every level's link target exists first
  await upsertProducts(grandParents);
  await upsertProducts(parents);
  await upsertProducts(children);

  await rollUpGrandParentStock(
    sellerId,
    grandParents.map((gp) => gp.productSkuCode)
  );

  return true;
};
