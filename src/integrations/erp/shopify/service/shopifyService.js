import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { shopifyConfig } from '#root/src/integrations/erp/shopify/config/config.js';
const { SHOPIFY_SHOP_URL, SHOPIFY_API_VERSION, ACCESS_TOKEN } = shopifyConfig;
const PRODUCTS_QUERY = `
query getProducts($cursor: String) {
  shop {
    currencyCode
  }

  products(first: 50, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }

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

        productCategory {
          productTaxonomyNode {
            id
            name
            fullName
          }
        }

        images(first: 10) {
          edges {
            node {
              url
              width
              height
              altText
            }
          }
        }

        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              barcode      #  EAN / UPC / GTIN
              price
              compareAtPrice
              taxable
              inventoryPolicy

              selectedOptions {
                name
                value
              }

              inventoryItem {
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

export const fetchProducts = async () => {
  try {
    let cursor = null;
    let hasNextPage = true;
    const allProducts = [];

    while (hasNextPage) {
      const response = await fetch(`${SHOPIFY_SHOP_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { cursor },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status} - ${errorText}`);
      }

      const json = await response.json();

      if (json.errors) {
        throw new Error(JSON.stringify(json.errors));
      }

      const { currencyCode } = json.data.shop;
      const { edges, pageInfo } = json.data.products;

      for (const { node } of edges) {
        /**  RESOLVE VARIANTS FIRST */
        const variants = await Promise.all(
          node.variants.edges.map(async ({ node: variant }) => {
            const stock =
              variant.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.quantities?.find((q) => q.name === 'available')
                ?.quantity ?? 0;

            const color = variant.selectedOptions?.find((o) => o.name.toLowerCase() === 'color')?.value || 'DEFAULT';

            const size = variant.selectedOptions?.find((o) => o.name.toLowerCase() === 'size')?.value || '';

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
            };
          })
        );

        /**  PUSH FULLY RESOLVED PRODUCT */
        allProducts.push({
          id: node.id.split('/').pop(),
          title: node.title,
          handle: node.handle,
          description: node.descriptionHtml,
          vendor: node.vendor,
          productType: node.productType,
          tags: node.tags,
          status: node.status,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          publishedAt: node.publishedAt,

          category: node.productCategory
            ? {
                id: node.productCategory.productTaxonomyNode.id,
                name: node.productCategory.productTaxonomyNode.name,
                fullName: node.productCategory.productTaxonomyNode.fullName,
              }
            : null,

          images: node.images.edges.map(({ node }) => ({
            url: node.url,
            width: node.width,
            height: node.height,
            altText: node.altText,
          })),

          variants, //  REAL OBJECTS, NO PROMISES
        });
      }

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;
    }

    return allProducts;
  } catch (err) {
    console.error('Shopify GraphQL fetch error:', err);
    return [];
  }
};
