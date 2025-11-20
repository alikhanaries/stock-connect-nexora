import mongoose from 'mongoose';

export const canonicalProductMapper = (item = {}, sellerId) => {
  if (!item) return null;

  return {
    sellerId: new mongoose.Types.ObjectId(sellerId),
    grandParentProductSkuCode: item.grandParentProductSkuCode || null,
    parentProductSkuCode: item.parentProductSkuCode || null,
    productSkuCode: item.productSkuCode,
    name: item.name || '',
    nameAr: item.nameAr || '',
    descriptionAr: item.descriptionAr || '',
    description: item.description || '',
    brand: item.brand || '',
    color: item.color || '',
    size: item.size || '',
    ean: item.ean || '',
    categoryTrail: item.categoryTrail || '',
    price: item.price || 0,
    minPrice: item.minPrice || 0,
    maxPrice: item.maxPrice || 0,
    msrp: item.msrp || 0,
    purchasePrice: item.purchasePrice || 0,
    shippingCost: item.shippingCost || 0,
    shippingTime: item.shippingTime || 0,
    currentStockCount: item.currentStockCount || 0,
    volumetricWeightCm: item.volumetricWeightCm || 0,
    hsCodeAE: item.hsCodeAE || '1111111',
    hsCodeSA: item.hsCodeSA || '1111111',
    primaryImageUrl: item.primaryImageUrl || '',
    imageUrl: item.imageUrl || '',
    extraImageUrl1: item.extraImageUrl1 || '',
    extraImageUrl2: item.extraImageUrl2 || '',
    extraImageUrl3: item.extraImageUrl3 || '',
    vatRateType: item.vatRateType || 'STANDARD',
    productType: item.productType || 'simple',
  };
};
