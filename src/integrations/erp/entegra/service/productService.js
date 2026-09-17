import Product from '#models/Product.js';
import Seller from '#models/Seller.js';
import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
import { filterProductsWithImages } from '../helpers/filterProductsWithImages.js';
import { mapProductToDB } from '../helpers/formatter.js';
import { fetchCategories } from './categoryService.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';
import { getMappingBySellerSlug, isBrandForSeller } from '../helpers/brandMapping.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { markMissingSkusRemoved } from '#root/src/helpers/ProductHierarchy.js';
const BASE_URL = `${entegraConfig?.ENTEGRA_BASE_URL}product/page=`;

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
  // Resolve which Entegra brand belongs to this seller (slug-driven mapping)
  const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
  if (!seller?.slug) throw new Error(`Seller ${sellerId} not found or missing slug`);

  const mapping = getMappingBySellerSlug(seller.slug);
  if (!mapping) throw new Error(`Seller slug "${seller.slug}" is not a supported Entegra brand`);
  const { sellerSlug, displayBrand } = mapping;

  const AUTH_TOKEN = await getAccessToken();

  let page = 1;
  let totalImported = 0;
  const feedSkuCodes = new Set();
  const categories = await fetchCategories(AUTH_TOKEN);
  const existingSkus = new Set(
    (await Product.find({ sellerId }, { productSkuCode: 1 }).lean()).map((p) => p.productSkuCode)
  );
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

    // Keep only products whose brand maps to this seller's slug
    const brandFiltered = rawList.filter((p) => isBrandForSeller(p?.brand, sellerSlug));
    const list = filterProductsWithImages(brandFiltered);

    let importedThisPage = 0;

    for (const product of list) {
      try {
        const writtenSkus = await createOrUpdateProduct(sellerId, product, categories, isImageUpdate, existingSkus);
        writtenSkus.forEach((sku) => feedSkuCodes.add(sku));
        importedThisPage++;
        totalImported++;
      } catch (err) {
        console.error(`Error saving product ${product.productCode ?? 'unknown'}:`, err.message);
      }
    }
    console.log(` [${displayBrand}] Imported ${importedThisPage} products from page ${page}`);

    // Go to next page
    page++;
  }

  console.log(` [${displayBrand}] Total products imported: ${totalImported}`);

  if (feedSkuCodes.size) {
    await markMissingSkusRemoved(sellerId, [...feedSkuCodes]);
  }

  await updateSyncDate(sellerId, 'PRODUCT', totalImported);
  return totalImported;
};

/**
 * Create Product + Variants (configurable or simple)
 */

export const createOrUpdateProduct = async (
  sellerId,
  product,
  categories,
  isImageUpdate = true,
  existingSkus = new Set()
) => {
  const categoryId = product.group; // e.g., '4'
  const categoryTrail = categoryId ? categories.find((cat) => cat.id == categoryId).name : '';

  // ---------------------------------------------
  // Map product to DB structure
  // ---------------------------------------------
  const { parents, children } = await mapProductToDB(sellerId, product, categoryTrail, isImageUpdate, existingSkus);

  // ---------------------------------------------
  // Upsert parents
  // ---------------------------------------------
  if (parents.length > 0) {
    await Promise.all(
      parents.map((p) =>
        Product.findOneAndUpdate(
          { productSkuCode: p.productSkuCode },
          {
            $set: {
              ...p,
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
  }

  // ---------------------------------------------
  // Upsert children
  // ---------------------------------------------
  if (children.length > 0) {
    await Promise.all(
      children.map((c) =>
        Product.findOneAndUpdate(
          { productSkuCode: c.productSkuCode },
          {
            $set: {
              ...c,
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
  }

  return [...parents, ...children].map((p) => p.productSkuCode);
};
