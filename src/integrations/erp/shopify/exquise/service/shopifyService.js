import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import Seller from '#root/src/models/Seller.js';
import { exquiseShopifyConfig } from '../config/config.js';
/**
 * Bulk Operations query — no `first`/`after` needed.
 * Shopify handles all pagination internally with no cost limits.
 */
const BULK_PRODUCTS_QUERY = `
{
  products {
    edges {
      node {
        id
        title
        handle
        descriptionHtml
        vendor
        productType
        tags
        status
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
        productCategory {
          productTaxonomyNode {
            id
            name
            fullName
          }
        }
        images {
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
        variants {
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
                inventoryLevels {
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

async function shopifyGraphQL(url, apiVersion, accessToken, query, variables = {}) {
  const response = await fetch(`${url}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

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

/**
 * Parses the flat JSONL lines from a bulk operation into nested product objects.
 *
 * JSONL structure from Shopify Bulk Operations:
 * - Product lines:         id = gid://shopify/Product/...
 * - ProductImage lines:    id = gid://shopify/ProductImage/...,    __parentId = Product GID
 * - ProductVariant lines:  id = gid://shopify/ProductVariant/...,  __parentId = Product GID
 * - InventoryLevel lines:  id = gid://shopify/InventoryLevel/...,  __parentId = InventoryItem GID
 */
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
      // __parentId points directly to ProductVariant
      const variant = variantsMap.get(parentId);
      if (variant) variant._inventoryLevels.push(obj);
    }
  }

  return productsMap;
}

export const fetchExquiseProducts = async (sellerData) => {
  try {
    const { url, apiVersion, accessToken } = sellerData;

    // 1. Fetch shop currency separately (bulk ops only support root-level connections)
    const shopData = await shopifyGraphQL(url, apiVersion, accessToken, SHOP_QUERY);
    const currencyCode = shopData.shop.currencyCode;

    // 2. Submit bulk operation
    const bulkData = await shopifyGraphQL(url, apiVersion, accessToken, BULK_MUTATION, {
      query: BULK_PRODUCTS_QUERY,
    });

    const { bulkOperation, userErrors } = bulkData.bulkOperationRunQuery;
    if (userErrors?.length) {
      throw new Error(`Bulk operation errors: ${JSON.stringify(userErrors)}`);
    }
    console.log(`Bulk operation started: ${bulkOperation.id}, status: ${bulkOperation.status}`);

    // 3. Poll until complete
    let operation;
    while (true) {
      await sleep(2000);
      const pollData = await shopifyGraphQL(url, apiVersion, accessToken, POLL_QUERY);
      operation = pollData.currentBulkOperation;

      if (!operation) throw new Error('No current bulk operation found');
      console.log(`Bulk operation status: ${operation.status}, objects: ${operation.objectCount}`);

      if (operation.status === 'COMPLETED') break;
      if (['FAILED', 'CANCELED', 'EXPIRED'].includes(operation.status)) {
        throw new Error(`Bulk operation ${operation.status}: ${operation.errorCode || ''}`);
      }
    }

    if (!operation.url) {
      console.log('Bulk operation completed with no data');
      return [];
    }

    // 4. Download and parse JSONL
    const fileResponse = await fetch(operation.url);
    const text = await fileResponse.text();
    const lines = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    // 5. Reassemble flat JSONL into nested products
    const productsMap = parseBulkJsonl(lines);
    const allProducts = [];

    for (const [, node] of productsMap) {
      // const sarPriceNamshi = node.sarPriceNamshi?.value
      //   ? parseFloat(JSON.parse(node.sarPriceNamshi.value)?.amount)
      //   : null;

      // const sarPriceNoon = node.sarPriceNoon?.value ? parseFloat(JSON.parse(node.sarPriceNoon.value)?.amount) : null;

      // if (sarPriceNamshi === null || sarPriceNoon === null) {
      //   continue;
      // }

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

      const variants = await Promise.all(
        node._variants.map(async (variant) => {
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

      allProducts.push({
        id: node.id.split('/').pop(),
        title: node.title,
        handle: node.handle,
        description: node.descriptionHtml,
        vendor: node.vendor,
        productType: node.productType,
        tags: node.tags,
        status: mapShopifyStatus(node.status),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        publishedAt: node.publishedAt,
        // sarPriceNamshi,
        // sarPriceNoon,
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
  } catch (err) {
    console.error('Shopify GraphQL fetch error:', err);
    return [];
  }
};

export const getShopifyConfig = async (sellerId) => {
  try {
    const sellerData = await Seller.findById(sellerId).select(
      '_id shopifyConfig.url shopifyConfig.apiVersion +shopifyConfig.accessToken'
    );

    const dbConfig = sellerData?.shopifyConfig;

    const config = {
      url: dbConfig?.url || exquiseShopifyConfig.SHOP_URL,
      apiVersion: dbConfig?.apiVersion || exquiseShopifyConfig.API_VERSION,
      accessToken: dbConfig?.accessToken || exquiseShopifyConfig.ACCESS_TOKEN,
    };

    if (!config.url || !config.apiVersion || !config.accessToken) {
      return null;
    }

    return config;
  } catch (error) {
    console.error('getShopifyConfig error:', error);
    throw error;
  }
};

const mapShopifyStatus = (status) => {
  if (status === 'ARCHIVED') return 'removed';
  if (status === 'ACTIVE') return 'active';
  return 'inactive'; // DRAFT or anything else
};
