import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { refreshShopifyAccessToken } from '../service/shopifyService.js';

// ─── GraphQL Queries ────────────────────────────────────────────────

const BULK_PRODUCTS_QUERY = `
{
  products(first: 250, query: "status:active") {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        vendor
        productType
        tags
        createdAt
        updatedAt
        publishedAt
        sarPriceNamshi: metafield(namespace: "custom", key: "sar_price_namshi") {
          value
          type
        }
        sarPriceNoon: metafield(namespace: "custom", key: "sar_price_noon") {
          value
          type
        }
        sarPriceAmazon: metafield(namespace: "custom", key: "sar_price_amazon") {
          value
          type
        }
        sarPriceStyli: metafield(namespace: "custom", key: "sar_price_styli") {
          value
          type
        }
        sarPrice6thstreet: metafield(namespace: "custom", key: "sar_price_6thstreet") {
          value
          type
        }
        productCategory {
          productTaxonomyNode {
            id
            name
            fullName
          }
        }
        images(first: 250) {
          edges {
            node {
              id
              url
              width
              height
              altText
            }
          }
        }
        variants(first: 250) {
          edges {
            node {
              id
              title
              sku
              barcode
              price
              compareAtPrice
              taxable
              inventoryPolicy
              sarPriceNamshi: metafield(namespace: "custom", key: "sar_price_namshi") {
                value
                type
              }
              sarPriceNoon: metafield(namespace: "custom", key: "sar_price_noon") {
                value
                type
              }
              selectedOptions {
                name
                value
              }
              image {
                id
                url
                altText
              }
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

const SHOP_QUERY = `{ shop { currencyCode } }`;

const BULK_MUTATION = `
mutation bulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

const POLL_QUERY = `
{
  currentBulkOperation {
    id
    status
    errorCode
    objectCount
    fileSize
    url
  }
}
`;

async function shopifyGraphQL(config, query, variables = {}, { didRefresh = false } = {}) {
  const response = await fetch(`${config.url}/admin/api/${config.apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 && !didRefresh) {
    console.warn('Shopify 401 — refreshing access token and retrying once');
    await refreshShopifyAccessToken(config);
    return shopifyGraphQL(config, query, variables, { didRefresh: true });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseMetafieldAmount(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const amount = parseFloat(parsed?.amount);
    return isNaN(amount) ? null : amount;
  } catch {
    console.warn('Failed to parse metafield value:', value);
    return null;
  }
}

function parseBulkJsonl(lines) {
  const productsMap = new Map();
  const variantsMap = new Map();

  for (const obj of lines) {
    const id = obj.id || '';
    const parentId = obj.__parentId || '';

    if (id.includes('/Product/') && !id.includes('/ProductImage/') && !id.includes('/ProductVariant/')) {
      productsMap.set(id, { ...obj, _images: [], _variants: [] });
    } else if (id.includes('/ProductImage/')) {
      const product = productsMap.get(parentId);
      if (product) product._images.push(obj);
    } else if (id.includes('/ProductVariant/')) {
      const variant = { ...obj, _inventoryLevels: [] };
      const product = productsMap.get(parentId);
      if (product) product._variants.push(variant);
      variantsMap.set(id, variant);
    } else if (id.includes('/InventoryLevel/')) {
      const variant = variantsMap.get(parentId);
      if (variant) variant._inventoryLevels.push(obj);
    }
  }

  return productsMap;
}

// ─── Main Fetch ─────────────────────────────────────────────────────

export const fetchCatchProducts = async (sellerData) => {
  const config = sellerData;

  const shopData = await shopifyGraphQL(config, SHOP_QUERY);
  if (!shopData?.shop) {
    throw new Error('Failed to fetch shop data');
  }
  const currencyCode = shopData.shop.currencyCode;

  const bulkData = await shopifyGraphQL(config, BULK_MUTATION, {
    query: BULK_PRODUCTS_QUERY,
  });

  const { bulkOperation, userErrors } = bulkData.bulkOperationRunQuery;
  if (userErrors?.length) {
    throw new Error(`Bulk operation errors: ${JSON.stringify(userErrors)}`);
  }
  console.log(`Bulk operation started: ${bulkOperation.id}, status: ${bulkOperation.status}`);

  const MAX_POLL_ATTEMPTS = 900;
  const POLL_INTERVAL_MS = 2000;
  let operation;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const pollData = await shopifyGraphQL(config, POLL_QUERY);
    operation = pollData.currentBulkOperation;

    if (!operation) throw new Error('No current bulk operation found');
    console.log(`Bulk operation status: ${operation.status}, objects: ${operation.objectCount}`);

    if (operation.status === 'COMPLETED') break;
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(operation.status)) {
      throw new Error(`Bulk operation ${operation.status}: ${operation.errorCode || ''}`);
    }

    if (attempt === MAX_POLL_ATTEMPTS - 1) {
      throw new Error(`Bulk operation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
    }
  }

  if (!operation.url) {
    console.log('Bulk operation completed with no data');
    return [];
  }

  const fileResponse = await fetch(operation.url);
  if (!fileResponse.ok) {
    throw new Error(`Bulk operation download failed: ${fileResponse.status} ${fileResponse.statusText}`);
  }
  const text = await fileResponse.text();
  const trimmedText = text.trim();
  if (!trimmedText) {
    console.log('Bulk operation completed with empty data file');
    return [];
  }
  const lines = trimmedText.split('\n').map((line) => JSON.parse(line));

  const productsMap = parseBulkJsonl(lines);
  const allProducts = [];

  for (const [, node] of productsMap) {
    const sarPriceNamshi = safeParseMetafieldAmount(node.sarPriceNamshi?.value);
    const sarPriceNoon = safeParseMetafieldAmount(node.sarPriceNoon?.value);
    const sarPriceAmazon = safeParseMetafieldAmount(node.sarPriceAmazon?.value);
    const sarPriceStyli = safeParseMetafieldAmount(node.sarPriceStyli?.value);
    const sarPrice6thstreet = safeParseMetafieldAmount(node.sarPrice6thstreet?.value);

    if (sarPriceNamshi === null || sarPriceNoon === null) {
      continue;
    }

    const hasAllVariantsValid = node._variants.every((variant) => {
      const color = variant.selectedOptions?.find((o) => o.name.toLowerCase() === 'renk')?.value;
      const size = variant.selectedOptions?.find(
        (o) => o.name.toLowerCase() === 'boyut' || o.name.toLowerCase() === 'beden'
      )?.value;
      return color && size;
    });

    if (!hasAllVariantsValid) {
      continue;
    }

    const BATCH_SIZE = 10;
    const variants = [];
    for (let i = 0; i < node._variants.length; i += BATCH_SIZE) {
      const batch = node._variants.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (variant) => {
          const stock = variant._inventoryLevels?.[0]?.quantities?.find((q) => q.name === 'available')?.quantity ?? 0;

          const color = variant.selectedOptions?.find((o) => o.name.toLowerCase() === 'renk')?.value || 'DEFAULT';
          const size =
            variant.selectedOptions?.find((o) => o.name.toLowerCase() === 'boyut' || o.name.toLowerCase() === 'beden')
              ?.value || 'DEFAULT';

          const finalPrice = await priceConverter(currencyCode, Number(variant.price));

          return {
            id: variant.id.split('/').pop(),
            title: variant.title,
            price: finalPrice,
            compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
            sku: variant.sku,
            taxable: variant.taxable,
            inventoryPolicy: variant.inventoryPolicy,
            stock,
            color,
            size,
            options: variant.selectedOptions,
            barcode: variant.barcode,
            image: variant.image
              ? {
                  id: variant.image.id,
                  url: variant.image.url,
                  altText: variant.image.altText || '',
                }
              : null,
          };
        })
      );
      variants.push(...batchResults);
    }

    allProducts.push({
      id: node.id.split('/').pop(),
      title: node.title,
      handle: node.handle,
      description: node.descriptionHtml,
      vendor: node.vendor,
      productType: node.productType,
      tags: node.tags,
      status: 'active',
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      publishedAt: node.publishedAt,
      sarPriceNamshi,
      sarPriceNoon,
      sarPriceAmazon,
      sarPriceStyli,
      sarPrice6thstreet,
      category: node.productCategory
        ? {
            id: node.productCategory.productTaxonomyNode.id,
            name: node.productCategory.productTaxonomyNode.name,
            fullName: node.productCategory.productTaxonomyNode.fullName,
          }
        : null,
      images: node._images.map((img) => ({
        id: img.id,
        url: img.url,
        width: img.width,
        height: img.height,
        altText: img.altText,
      })),
      variants,
    });
  }

  return allProducts;
};
