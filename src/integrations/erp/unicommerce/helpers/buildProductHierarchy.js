export const mapChildrenByParent = (children) => {
  const map = new Map();

  for (const child of children) {
    const parentSku = child.parentProductSkuCode;
    if (!parentSku) continue;

    if (!map.has(parentSku)) {
      map.set(parentSku, []);
    }

    map.get(parentSku).push(child);
  }

  return map;
};
export const formatProduct = (parent, variants) => ({
  id: parent._id,
  parentTitle: parent.name,
  brand: parent.brand,

  variants: variants.map((v) => ({
    imageUrl: v.extraImageUrl1 || v.primaryImageUrl || '',
    productUrl: v.primaryImageUrl || v.imageUrl || '',
    variantId: v.productSkuCode,
    title: v.name,
    sku: v.productSkuCode,
    size: v.size || '',
    color: v.color || '',
    live: v.status === 'active',
    productDescription: v.description || '',

    itemPrice: {
      currency: 'SAR',
      listingPrice: 0,
      mrp: v.price || 0,
      msp: v.msrp || 0,
      netSellerPayable: 0,
    },

    inventory: v.currentStockCount || 0,
    blockedInventory: 0,
    pendency: 0,
  })),

  commissionPercentage: 0,
  paymentGatewayCharge: 0,
  logisticsCost: 0,
  additionalInfo: '',
  created: parent.createdAt,
});
