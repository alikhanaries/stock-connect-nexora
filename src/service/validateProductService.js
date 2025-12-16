import Product from '#models/Product.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import { PRODUCT_REQUIRED_FIELDS } from '#constants/product.js';
//  Validate products
const validateProducts = async (channelId, sellerId) => {
  // Get all SKU codes linked to the channel
  const channelProducts = await UserChannelProducts.find(
    { sellerId, channelId },
    { 'skuList.skuCode': 1, _id: 0 }
  ).lean();

  const skuCodes = channelProducts.flatMap((cp) => cp.skuList.map((s) => s.skuCode));
  if (!skuCodes.length) return { validProducts: [] };

  // Get products for those SKUs (child products)
  const childProducts = await Product.find({
    sellerId,
    productSkuCode: { $in: skuCodes },
    status: 'active',
  }).lean();

  // Collect all related SKU codes (child + parent + grandparent)
  const allSkuCodes = new Set();

  for (const p of childProducts) {
    // child
    allSkuCodes.add(p.productSkuCode);

    // parent
    if (p.parentProductSkuCode) {
      allSkuCodes.add(p.parentProductSkuCode);
    }

    // grandparent
    if (p.grandParentProductSkuCode) {
      allSkuCodes.add(p.grandParentProductSkuCode);
    }
  }

  // Fetch all related products
  const allProducts = await Product.find({
    sellerId,
    productSkuCode: { $in: [...allSkuCodes] },
    status: 'active',
  }).lean();

  const allProductsMap = new Map();
  for (const p of allProducts) {
    allProductsMap.set(p.productSkuCode, p);
  }

  const validatedProducts = [...allProductsMap.values()];
  const missingErrors = [];

  validatedProducts.forEach((item) => {
    const businessErrors = [];
    // Mandatory field check
    const mandatoryErrors = PRODUCT_REQUIRED_FIELDS.filter(
      (field) => !item[field] || String(item[field]).trim() === ''
    );

    // Business logic checks
    if (Number(item.price) <= 0) {
      businessErrors.push('price must be greater than zero');
    }

    if (Number(item.currentStockCount) <= 0) {
      businessErrors.push('currentStockCount must be greater than zero');
    }

    if (Number(item.volumetricWeightCm) >= 2) {
      businessErrors.push('volumetricWeightCm must be less than 2 kg');
    }

    // business rules
    const hasParent = !!item.parentProductSkuCode;
    const hasGrandParent = !!item.grandParentProductSkuCode;

    const isGrandparent = !hasParent && !hasGrandParent;
    const isParent = !hasParent && hasGrandParent;
    const isChild = hasParent && hasGrandParent;

    if (isGrandparent) {
      if (hasParent) businessErrors.push('parentProductSkuCode should be null for grandparent');
      if (hasGrandParent) businessErrors.push('grandParentProductSkuCode should be null for grandparent');
    } else if (isParent) {
      if (!hasGrandParent) businessErrors.push('grandParentProductSkuCode is required for parent');
      if (hasParent) businessErrors.push('parentProductSkuCode should be null for parent');
    } else if (isChild) {
      if (!hasGrandParent) businessErrors.push('grandParentProductSkuCode is required for child');
      if (!hasParent) businessErrors.push('parentProductSkuCode is required for child');
    }

    if (mandatoryErrors.length || businessErrors.length) {
      missingErrors.push({
        skuCode: item.productSkuCode || 'N/A',
        mandatory: mandatoryErrors,
        business: businessErrors,
      });
    }
  });

  // If errors exist
  if (missingErrors.length > 0) {
    return {
      success: false,
      validProducts: [],
      message: {
        mandatoryMessage: [...new Set(missingErrors.flatMap((e) => e.mandatory))].length
          ? `${[...new Set(missingErrors.flatMap((e) => e.mandatory))].join(', ')} are missing`
          : null,
        businessMessage: [...new Set(missingErrors.flatMap((e) => e.business))],
      },
    };
  }

  // Everything valid
  return {
    success: true,
    validProducts: validatedProducts,
  };
};

export default {
  validateProducts,
};
