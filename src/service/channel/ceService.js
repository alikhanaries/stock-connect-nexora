import { getCommerceProvider } from '#service/commerce/commerceProviderFactory.js';

export const getExistingProductsBySkuFromCE = async (skuList = []) => {
  return getCommerceProvider().getProductsByMerchantSkuList(skuList);
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
    const response = await getCommerceProvider().postProductsBulkDelete(skuCodes);

    if (!response.ok) {
      const errorText = response.rawText || JSON.stringify(response.data);
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
  if (!bulkPayload.length) return [];
  const response = await getCommerceProvider().patchProductsExtraDataBulk(bulkPayload);
  if (!response.ok) {
    throw new Error(`Marketplace PATCH failed: ${response.status}`);
  }
  return response.data;
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
