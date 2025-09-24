export const mapProductToChannelEngine = (product) => {
  const customAttributes = [
    { Key: 'MarketPlace', Value: product.marketPlace, Type: 'TEXT', IsPublic: true, LanguageIsoCode: 'en' },
    { Key: 'Stock', Value: product.currentStockCount || 0, Type: 'TEXT', IsPublic: true, LanguageIsoCode: 'en' },
  ];
  const attributesString = product.attributes || '';
  return {
    ParentMerchantProductNo: '',
    ParentMerchantProductNo2: '',
    ExtraData: [
      { Key: 'Attributes', Value: attributesString, Type: 'TEXT', IsPublic: true, LanguageIsoCode: 'en' },
      ...customAttributes,
    ],
    Name: product.name,
    Description: product.description,
    Brand: product.brand,
    Size: product.size || '',
    Color: product.color || '',
    Ean: product.ean,
    ManufacturerProductNumber: product.productSkuCode,
    MerchantProductNo: product.productSkuCode,
    Price: product.price,
    MinPrice: product.minPrice,
    MaxPrice: product.maxPrice,
    MSRP: product.msrp,
    PurchasePrice: product.purchasePrice,
    VatRateType: product.vatRateType,
    ShippingCost: product.shippingCost,
    ShippingTime: product.shippingTime,
    Url: product.url,
    ImageUrl: product.images?.[0] || '',
    CategoryTrail: product.categoryTrail,
    IsFrozen: false,
  };
};
