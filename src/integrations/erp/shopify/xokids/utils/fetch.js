// ─── GraphQL Queries for Bulk Operations ──────────────────────────────

const getBulkProductsQuery = (searchQuery) => `
{
  products(first: 250, query: "${searchQuery}") {
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
        productCategory {
          productTaxonomyNode {
            id
            name
            fullName
          }
        }
        metafields(first: 50) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
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

// ─── Helpers ────────────────────────────────────────────────────────

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

function safeParseMetafieldAmount(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      const amount = parseFloat(parsed?.amount);
      return isNaN(amount) ? null : amount;
    }
  } catch {
    // treat as plain number
  }
  const direct = parseFloat(value);
  return isNaN(direct) ? null : direct;
}

function parseBulkJsonl(lines) {
  const productsMap = new Map();
  const variantsMap = new Map();

  for (const obj of lines) {
    const id = obj.id || '';
    const parentId = obj.__parentId || '';

    if (id.includes('/Product/') && !id.includes('/ProductImage/') && !id.includes('/ProductVariant/')) {
      productsMap.set(id, { ...obj, _images: [], _variants: [], _metafields: [] });
    } else if (id.includes('/ProductImage/')) {
      const product = productsMap.get(parentId);
      if (product) product._images.push(obj);
    } else if (id.includes('/ProductVariant/')) {
      const variant = { ...obj, _inventoryLevels: [] };
      const product = productsMap.get(parentId);
      if (product) product._variants.push(variant);
      variantsMap.set(id, variant);
    } else if (id.includes('/InventoryLevel/') || (obj.quantities && parentId)) {
      const variant = variantsMap.get(parentId);
      if (variant) variant._inventoryLevels.push(obj);
    } else if (id.includes('/Metafield/')) {
      const product = productsMap.get(parentId);
      if (product) {
        product._metafields.push(obj);
      }
    } else if (obj.url && parentId && productsMap.has(parentId)) {
      const product = productsMap.get(parentId);
      if (product) product._images.push(obj);
    }
  }

  return productsMap;
}

// ─── Main Bulk Fetch ─────────────────────────────────────────────────

export const fetchXokidsShopifyProducts = async (shopifyConfig, searchQuery = 'status:active') => {
  try {
    const { url, apiVersion, accessToken } = shopifyConfig;

    console.log(`[Xokids Shopify API] Starting Shopify Bulk Operation with query: ${searchQuery}`);
    const bulkData = await shopifyGraphQL(url, apiVersion, accessToken, BULK_MUTATION, {
      query: getBulkProductsQuery(searchQuery),
    });

    const { bulkOperation, userErrors } = bulkData.bulkOperationRunQuery;
    if (userErrors?.length) {
      throw new Error(`Bulk operation errors: ${JSON.stringify(userErrors)}`);
    }
    console.log(`[Xokids Shopify API] Bulk operation started: ${bulkOperation.id}, status: ${bulkOperation.status}`);

    const MAX_POLL_ATTEMPTS = 900;
    const POLL_INTERVAL_MS = 2000;
    let operation;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const pollData = await shopifyGraphQL(url, apiVersion, accessToken, POLL_QUERY);
      operation = pollData.currentBulkOperation;

      if (!operation) throw new Error('No current bulk operation found');
      console.log(
        `[Xokids Shopify API] Bulk operation status: ${operation.status}, objects collected: ${operation.objectCount}`
      );

      if (operation.status === 'COMPLETED') break;
      if (['FAILED', 'CANCELED', 'EXPIRED'].includes(operation.status)) {
        throw new Error(`Bulk operation ${operation.status}: ${operation.errorCode || ''}`);
      }

      if (attempt === MAX_POLL_ATTEMPTS - 1) {
        throw new Error(`Bulk operation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
      }
    }

    if (!operation.url) {
      console.log('[Xokids Shopify API] Bulk operation completed with no data URL');
      return [];
    }

    console.log('[Xokids Shopify API] Downloading bulk operation result file...');
    const fileResponse = await fetch(operation.url);
    if (!fileResponse.ok) {
      throw new Error(`Bulk operation download failed: ${fileResponse.status} ${fileResponse.statusText}`);
    }

    const text = await fileResponse.text();
    const trimmedText = text.trim();
    if (!trimmedText) {
      console.log('[Xokids Shopify API] Bulk operation returned empty data file');
      return [];
    }

    const lines = trimmedText.split('\n').map((line) => JSON.parse(line));

    const productsMap = parseBulkJsonl(lines);
    const allProducts = [];

    console.log('[Xokids Shopify API] Processing and parsing bulk records...');

    for (const [, node] of productsMap) {
      const findMetafield = (key) => {
        const found = (node._metafields || []).find((m) => m.key === key);
        return found ? safeParseMetafieldAmount(found.value) : null;
      };

      const sarPrices = findMetafield('sar_prices');
      const sarPriceNamshi = findMetafield('sar_price_namshi');
      const sarPriceNoon = findMetafield('sar_price_noon');
      const sarPriceAmazon = findMetafield('sar_price_amazon');
      const sarPriceStyli = findMetafield('sar_price_styli');
      const sarPrice6thstreet = findMetafield('sar_price_6thstreet');

      const mappedVariants = await Promise.all(
        (node._variants || []).map(async (variant) => {
          const stock = variant._inventoryLevels?.[0]?.quantities?.find((q) => q.name === 'available')?.quantity ?? 0;
          if (stock <= 0) return null;

          const colorOption = variant.selectedOptions?.find(
            (o) =>
              o.name.toLowerCase() === 'color' || o.name.toLowerCase() === 'colour' || o.name.toLowerCase() === 'renk'
          );
          const sizeOption = variant.selectedOptions?.find(
            (o) =>
              o.name.toLowerCase() === 'size' || o.name.toLowerCase() === 'beden' || o.name.toLowerCase() === 'boyut'
          );
          if (!colorOption || !sizeOption) return null;

          const color = colorOption.value?.trim();
          const size = sizeOption.value?.trim();
          if (
            !color ||
            !size ||
            color.toLowerCase() === 'default' ||
            color.toLowerCase().includes('default') ||
            size.toLowerCase() === 'default' ||
            size.toLowerCase().includes('default')
          ) {
            return null;
          }

          const finalPrice = Number(variant.price);

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

      const variants = mappedVariants.filter((v) => v !== null);
      if (!variants.length) continue;

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
        sarPrices,
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
        images: (node._images || []).map((img) => ({
          id: img.id,
          url: img.url,
          width: img.width,
          height: img.height,
          altText: img.altText,
        })),
        variants,
        allVariantImageIds: (node._variants || []).map((v) => v.image?.id).filter(Boolean),
      });
    }

    const first10Skus = [];
    for (const p of allProducts) {
      for (const v of p.variants) {
        if (first10Skus.length < 10) {
          first10Skus.push({ productId: p.id, variantId: v.id, sku: v.sku });
        }
      }
    }
    console.log('[Xokids Shopify API] First 10 SKUs in raw response:', JSON.stringify(first10Skus, null, 2));

    return allProducts;
  } catch (err) {
    console.error('Xokids Shopify Bulk Operation fetch error:', err);
    throw err;
  }
};

const mapShopifyStatus = (status) => {
  if (status === 'ARCHIVED') return 'removed';
  if (status === 'ACTIVE') return 'active';
  return 'inactive';
};
