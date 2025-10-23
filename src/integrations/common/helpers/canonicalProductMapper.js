import mongoose from 'mongoose';

export const canonicalProductMapper = (item = {}, sellerId) => {

  const mappedProduct = {
    sellerId: mongoose.Types.ObjectId.isValid(sellerId) ? new mongoose.Types.ObjectId(sellerId) : null,

    //  Identification
    parentProductId: null,
    parentProductSkuCode: item.ItemCode || null,
    productSkuCode: item.ItemCode || null,

    //  Basic Info
    name: item.ItemName || '',
    description: item.ItemDesc || '',
    brand: item.BrandDesc || '',
    ean: item.Barcode || '',
    attributes: JSON.stringify({
      ColorCode: item.ColorCode || '',
      ColorDesc: item.ColorDesc || '',
      SizeCode: item.ItemDim1Code || '',
      SizeDesc: item.ItemDim1Desc || '',
      Category1: item.Cat01Desc || '',
      Category2: item.Cat02Desc || '',
    }),

    //  Pricing
    price: Number(item.Price ?? 0),
    purchasePrice: Number(item.Price ?? 0),
    vatRateType: item.Vat > 0 ? 'STANDARD' : 'ZERO',

    //  Stock
    currentStockCount: Number(item.Qty ?? 0),

    //  Category & Brand
    categories: [],
    categoryTrail: [item.Cat01Desc, item.Cat02Desc].filter(Boolean).join(' > ') || '',

    //  Media
    images: item.images || [],
    extraImageUrl1: null,
    extraImageUrl2: null,
    extraImageUrl3: null,

    //  Variants
    size: item.ItemDim1Desc || '',
    color: item.ColorDesc || '',

    //  Logistics
    volumetricWeightCm: 1,
    hsCodeAE: '000000',
    hsCodeSA: '000000',

    //  Misc
    status: 'active',
    shippingCost: 0,
    shippingTime: '',
    url: '',
  };
  return mappedProduct;
};
