import Seller from '#root/src/models/Seller.js';

export const getShopifyConfig = async (sellerId) => {
  try {
    const sellerData = await Seller.findById(sellerId).select(
      '_id shopifyConfig.url shopifyConfig.apiVersion +shopifyConfig.accessToken'
    );

    const dbConfig = sellerData?.shopifyConfig;

    if (!dbConfig?.url || !dbConfig?.apiVersion || !dbConfig?.accessToken) {
      return null;
    }

    return {
      url: dbConfig.url,
      apiVersion: dbConfig.apiVersion,
      accessToken: dbConfig.accessToken,
    };
  } catch (error) {
    console.error('getShopifyConfig error:', error);
    throw error;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const handleRateLimit = async (response) => {
  const limit = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
  if (!limit) return;

  const [used, max] = limit.split('/').map(Number);
  if (used >= max - 5) {
    await delay(1000);
  }
};

export const createShopifyOrder = async (config, payload, retryCount = 0) => {
  try {
    if (!payload || typeof payload !== 'object') {
      throw new Error('createShopifyOrder expects a payload object');
    }

    const orderUrl = `${config.url}/admin/api/${config.apiVersion}/orders.json`;

    const response = await fetch(orderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify(payload),
    });

    await handleRateLimit(response);

    if (response.status === 429) {
      if (retryCount >= 3) {
        throw new Error('Shopify rate limit exceeded (max retries)');
      }
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = (retryAfter ? Number(retryAfter) : 2) * 1000;
      await delay(waitTime);
      return createShopifyOrder(config, payload, retryCount + 1);
    }

    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(`Shopify create failed (${response.status}): ${JSON.stringify(responseBody)}`);
    }

    return {
      success: true,
      shopifyOrderId: responseBody.order.id,
      shopifyOrderName: responseBody.order.name,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
};

export const updateShopifyOrder = async (config, shopifyOrderId, payload, retryCount = 0) => {
  try {
    if (!shopifyOrderId) {
      throw new Error('shopifyOrderId is required for update');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('updateShopifyOrder expects a payload object');
    }

    const orderUrl = `${config.url}/admin/api/${config.apiVersion}/orders.json/${shopifyOrderId}.json`;

    const response = await fetch(orderUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({
        order: {
          id: shopifyOrderId,
          note: payload.order?.note,
          tags: payload.order?.tags,
          metafields: payload.order?.metafields,
        },
      }),
    });

    await handleRateLimit(response);

    if (response.status === 429) {
      if (retryCount >= 3) {
        throw new Error('Shopify rate limit exceeded (update max retries)');
      }
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = (retryAfter ? Number(retryAfter) : 2) * 1000;
      await delay(waitTime);
      return updateShopifyOrder(config, shopifyOrderId, payload, retryCount + 1);
    }

    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(`Shopify update failed (${response.status}): ${JSON.stringify(responseBody)}`);
    }

    return {
      success: true,
      shopifyOrderId,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
};

export const lookupVariantIdsBySkus = async (config, skus = []) => {
  const uniqueSkus = [...new Set(skus)];
  const skuToVariantId = new Map();

  const productGroups = new Map();
  for (const sku of uniqueSkus) {
    const match = sku.match(/^(\d+)/);
    if (!match) continue;
    const productId = match[1];
    if (!productGroups.has(productId)) {
      productGroups.set(productId, []);
    }
    productGroups.get(productId).push(sku);
  }

  for (const [productId, productSkus] of productGroups) {
    try {
      const url = `${config.url}/admin/api/${config.apiVersion}/products/${productId}/variants.json`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
        },
      });

      if (!response.ok) continue;

      const json = await response.json();
      const variants = json.variants || [];

      for (const sku of productSkus) {
        let matched = variants.find((v) => v.sku === sku);

        if (!matched) {
          const parts = sku.replace(`${productId}-`, '').split('-');
          const color = (parts[0] || '').replace(/_/g, ' ');
          const size = (parts.slice(1).join('-') || '').replace(/_/g, ' ');

          matched = variants.find((v) => {
            const v1 = (v.option1 || '').toUpperCase();
            const v2 = (v.option2 || '').toUpperCase();
            return (
              (v1 === color.toUpperCase() && v2 === size.toUpperCase()) ||
              (v1 === size.toUpperCase() && v2 === color.toUpperCase())
            );
          });
        }

        if (matched) {
          skuToVariantId.set(sku, String(matched.id));
        }
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  return skuToVariantId;
};
