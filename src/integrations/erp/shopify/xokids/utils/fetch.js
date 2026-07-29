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

const normalizeKey = (key) => (key ? String(key).trim().toLowerCase() : '');

async function fetchShopifyPriceListsAllPages(url, apiVersion, accessToken) {
  const priceLists = [];
  let hasNextPriceList = true;
  let priceListCursor = null;

  while (hasNextPriceList) {
    const afterClause = priceListCursor ? `, after: "${priceListCursor}"` : '';
    const query = `
      query {
        priceLists(first: 250${afterClause}) {
          edges {
            cursor
            node {
              id
              name
              currency
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    try {
      const data = await shopifyGraphQL(url, apiVersion, accessToken, query);
      const edges = data?.priceLists?.edges || [];
      const pageInfo = data?.priceLists?.pageInfo;

      for (const edge of edges) {
        const plNode = edge.node;
        const allPrices = [];

        let hasNextPrice = true;
        let priceCursor = null;

        while (hasNextPrice) {
          const priceAfterClause = priceCursor ? `, after: "${priceCursor}"` : '';
          const pricesQuery = `
            query {
              priceList(id: "${plNode.id}") {
                prices(first: 250${priceAfterClause}) {
                  edges {
                    cursor
                    node {
                      price {
                        amount
                        currencyCode
                      }
                      compareAtPrice {
                        amount
                        currencyCode
                      }
                      variant {
                        id
                        sku
                      }
                    }
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          `;

          const priceData = await shopifyGraphQL(url, apiVersion, accessToken, pricesQuery);
          const priceEdges = priceData?.priceList?.prices?.edges || [];
          const pricePageInfo = priceData?.priceList?.prices?.pageInfo;

          for (const pEdge of priceEdges) {
            if (pEdge.node) {
              allPrices.push(pEdge.node);
            }
          }

          hasNextPrice = Boolean(pricePageInfo?.hasNextPage);
          priceCursor = pricePageInfo?.endCursor || null;
        }

        priceLists.push({
          id: plNode.id,
          name: plNode.name,
          currency: plNode.currency,
          prices: { nodes: allPrices },
        });
      }

      hasNextPriceList = Boolean(pageInfo?.hasNextPage);
      priceListCursor = pageInfo?.endCursor || null;
    } catch (err) {
      console.error('[Xokids Shopify API] Error fetching paginated PriceLists:', err.message);
      break;
    }
  }

  return priceLists;
}

// ─── Main Bulk Fetch ─────────────────────────────────────────────────

export const fetchXokidsShopifyProducts = async (shopifyConfig, searchQuery = 'status:active') => {
  try {
    const { url, apiVersion, accessToken } = shopifyConfig;

    console.log('[Xokids Shopify API] Fetching ALL pages of PriceLists & Prices via GraphQL...');
    const priceLists = await fetchShopifyPriceListsAllPages(url, apiVersion, accessToken);
    const totalPricesCount = priceLists.reduce((sum, pl) => sum + (pl.prices?.nodes?.length || 0), 0);
    console.log(
      `[Xokids Shopify API] PriceLists fetched: ${priceLists.length} list(s), ${totalPricesCount} total price rules`
    );

    console.log(`[Xokids Shopify API] Starting Shopify Bulk Operation for products with query: ${searchQuery}`);
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

    const priceListPricesMap = new Map();
    for (const pl of priceLists) {
      if (pl.id !== 'gid://shopify/PriceList/34156019878' && !pl.id?.includes('34156019878')) continue;

      const plName = pl.name || '';
      for (const p of pl.prices?.nodes || []) {
        const amount = parseFloat(p.price?.amount);
        if (isNaN(amount)) continue;
        const sku = p.variant?.sku;
        const vId = p.variant?.id?.split('/').pop();
        const priceInfo = { amount, currency: p.price?.currencyCode, priceListName: plName, priceListId: pl.id };
        if (sku) priceListPricesMap.set(normalizeKey(sku), priceInfo);
        if (vId) priceListPricesMap.set(normalizeKey(vId), priceInfo);
      }
    }

    for (const [, node] of productsMap) {
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

          const variantNumericId = variant.id.split('/').pop();
          const plPrice =
            priceListPricesMap.get(normalizeKey(variant.sku)) ||
            priceListPricesMap.get(normalizeKey(variantNumericId)) ||
            null;

          if (plPrice?.amount == null || isNaN(parseFloat(plPrice.amount))) {
            return null;
          }

          const finalPrice = Number(plPrice.amount);

          return {
            id: variantNumericId,
            title: variant.title,
            price: finalPrice,
            namshiPrice: finalPrice,
            priceListPrice: plPrice?.amount || null,
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
        metafields: (node._metafields || []).map((m) => ({
          id: m.id,
          namespace: m.namespace,
          key: m.key,
          value: m.value,
          type: m.type,
        })),
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
