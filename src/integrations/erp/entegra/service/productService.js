import Product from '#models/Product.js';
import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
import { mapProductToDB } from '../helpers/formatter.js';
const BASE_URL = `${entegraConfig?.ENTEGRA_BASE_URL}product/page=`;
const AUTH_TOKEN = `JWT ${entegraConfig?.ENTEGRA_AUTH_TOKEN}`;

/**
 * Fetch one page from remote API
 */
const FETCH_TIMEOUT = 45000; // 45 sec (important for slow pages)
const MAX_RETRIES = 5; // more reliable for large imports

export const fetchProductsPage = async (page = 1) => {
  const url = `${BASE_URL}${page}/`;
  console.log(`Fetching URL: ${url}`);

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

      return json; // SUCCESS
    } catch (err) {
      console.error(`Fetch failed (Attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);

      if (attempt >= MAX_RETRIES) {
        throw new Error(`fetchProductsPage(${page}) failed after ${MAX_RETRIES} attempts`);
      }

      // Exponential retry wait
      const wait = attempt * 1000;
      console.log(`↻ Retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
};

/**
 * Fetch all pages & save products
 */
export const importAllProducts = async (sellerId) => {
  let page = 1;
  let totalImported = 0;

  while (true) {
    console.log(`Fetching page ${page}...`);

    let result;

    try {
      result = await fetchProductsPage(page);
    } catch (err) {
      console.error(`Failed to fetch page ${page}:`, err.message);
      break;
    }

    // Validate response format
    const list = result?.productList;
    if (!Array.isArray(list) || list.length === 0) {
      console.log('No more products. Import completed.');
      break;
    }

    console.log(`Page ${page} contains ${list.length} products.`);

    let importedThisPage = 0;

    // Process products sequentially (safe for DB writes)
    for (const product of list) {
      try {
        await createOrUpdateProduct(sellerId, product);
        importedThisPage++;
        totalImported++;
      } catch (err) {
        console.error(`Error saving product ${product.productCode ?? 'unknown'}:`, err.message);
      }
    }

    console.log(`Successfully imported ${importedThisPage} products from page ${page}`);

    // Go to next page
    page++;
  }

  console.log(`Total products imported: ${totalImported}`);
  return totalImported;
};

/**
 * Create Product + Variants (configurable or simple)
 */

export const createOrUpdateProduct = async (sellerId, p) => {
  const { parent, variants } = mapProductToDB(sellerId, p);

  const parentDoc = await Product.findOneAndUpdate({ productSkuCode: parent.productSkuCode }, parent, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  if (variants.length > 0) {
    await Promise.all(
      variants.map((v) =>
        Product.findOneAndUpdate({ productSkuCode: v.productSkuCode }, v, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        })
      )
    );
  }

  return parentDoc;
};

export default {
  fetchProductsPage,
  importAllProducts,
  createOrUpdateProduct,
};
