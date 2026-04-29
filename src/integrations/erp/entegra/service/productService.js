import Product from '#models/Product.js';
import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
import { filterInStockProducts } from '../helpers/filterInStockProducts.js';
import { mapProductToDB } from '../helpers/formatter.js';
import { fetchCategories } from './categoryService.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';
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

      if (Array.isArray(json.productList)) {
        json.productList = filterInStockProducts(json.productList);
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
export const importAllProducts = async (sellerId, isImageUpdate = false) => {
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
    const list = result?.productList;
    if (!Array.isArray(list) || list.length === 0) {
      console.log(' No more products. Import completed.');
      break;
    }

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
    console.log(` Successfully imported ${importedThisPage} products from page ${page}`);

    // Go to next page
    page++;
  }

  console.log(` Total products imported: ${totalImported}`);
  return totalImported;
};

/**
 * Create Product + Variants (configurable or simple)
 */

export const createOrUpdateProduct = async (sellerId, product, categories, isImageUpdate = false) => {
  const categoryId = product.group; // e.g., '4'
  const categoryTrail = categoryId ? categories.find((cat) => cat.id == categoryId).name : '';

  // ---------------------------------------------
  // Map product to DB structure
  // ---------------------------------------------
  const { parents, children } = await mapProductToDB(sellerId, product, categoryTrail, isImageUpdate);

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

  return true;
};
