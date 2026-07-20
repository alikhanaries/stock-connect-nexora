import { pickNamedImageFields, NAMED_IMAGE_URL_KEYS } from '#helpers/productImageFields.js';

export const canonicalProductMapper = (item = {}, sellerId) => {
  if (!item) return null;

  return {
    sellerId: sellerId,
    grandParentProductSkuCode: item.grandParentProductSkuCode || null,
    parentProductSkuCode: item.parentProductSkuCode || null,
    productSkuCode: item.productSkuCode,
    name: item.name || '',
    nameAr: item.nameAr,
    descriptionAr: item.descriptionAr,
    description: item.description || '',
    brand: item.brand || '',
    color: item.color || '',
    size: item.size || '',
    ean: item.ean || '',
    categoryTrail: item.categoryTrail || '',
    price: item.price || 0,
    noonPrice: item.noonPrice || 0,
    namshiPrice: item.namshiPrice || 0,
    amazonPrice: item.amazonPrice || 0,
    styliPrice: item.styliPrice || 0,
    sixthStreetPrice: item.sixthStreetPrice || 0,
    minPrice: item.minPrice || null,
    maxPrice: item.maxPrice || null,
    msrp: item.msrp || 0,
    purchasePrice: item.purchasePrice || 0,
    shippingCost: item.shippingCost || 0,
    shippingTime: item.shippingTime || 0,
    currentStockCount: item.currentStockCount || 0,
    volumetricWeightCm: item.volumetricWeightCm || 0,
    hsCodeSA: item.hsCodeSA ?? item.productSkuCode,
    hsCodeAE: item.hsCodeAE ?? item.productSkuCode,
    ...pickNamedImageFields(item),
    vatRateType: item.vatRateType || 'STANDARD',
    productType: item.productType || 'simple',
    source: item.source || 'MANUAL',
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

// Re-export for callers that need field lists
export { NAMED_IMAGE_URL_KEYS };
