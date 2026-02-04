import { config } from '#root/src/config/config.js';

const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

export const getExistingProductsBySkuFromCE = async (skuList = []) => {
  if (!skuList.length) return [];
  try {
    const params = new URLSearchParams({
      apiKey: CHANNEL_ENGINE_API_KEY,
    });
    skuList.forEach((sku) => {
      params.append('merchantProductNoList', sku);
    });

    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`ChannelEngine GET failed with status ${response.status}`);
    }
    const data = await response.json();
    return data?.Content || [];
  } catch (err) {
    console.error('Error fetching from ChannelEngine:', err);
    return [];
  }
};

export const chunkArray = (arr, size = 50) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export const removeProductsFromCE = async (skuCodes) => {
  if (!skuCodes?.length) return { success: true, message: 'No SKUs provided' };

  try {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products/bulkdelete?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skuCodes),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ChannelEngine bulkdelete failed:', errorText);
      return { success: false, message: errorText };
    }

    return { success: true };
  } catch (err) {
    console.error('Error calling ChannelEngine:', err);
    return { success: false, message: err.message };
  }
};

export const syncProductExtraDataToMarketplace = async (bulkPayload = []) => {
  console.log(bulkPayload, 'bulkPayload');

  if (!bulkPayload.length) return [];
  const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products/extra-data/bulk?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bulkPayload),
  });
  if (!response.ok) {
    throw new Error(`Marketplace PATCH failed: ${response.status}`);
  }
  return response.json();
};

export const buildExtraDataPayload = (products = []) =>
  products
    .filter((p) => p.productSkuCode)
    .map((p) => ({
      MerchantProductNo: p.productSkuCode,
      Operations: [
        {
          Op: 'replace',
          Key: 'MarketPlace',
          Value: p.marketPlace ?? null,
        },
      ],
    }));
