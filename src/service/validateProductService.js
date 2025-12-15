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

  // Collect parent SKUs from child products
  const parentSkuCodes = new Set();
  for (const p of childProducts) {
    if (p.parentProductSkuCode) parentSkuCodes.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) parentSkuCodes.add(p.grandParentProductSkuCode);
  }

  // Fetch parent products
  const parentProducts = await Product.find({
    sellerId,
    productSkuCode: { $in: Array.from(parentSkuCodes) },
    status: 'active',
  }).lean();

  // Check if those parents have any grandparent
  const grandParentSkuCodes = new Set();
  for (const p of parentProducts) {
    if (p.grandParentProductSkuCode) grandParentSkuCodes.add(p.grandParentProductSkuCode);
  }

  // Fetch grandparent products (if any)
  let grandParentProducts = [];
  if (grandParentSkuCodes.size > 0) {
    grandParentProducts = await Product.find({
      sellerId,
      productSkuCode: { $in: Array.from(grandParentSkuCodes) },
      status: 'active',
    }).lean();
  }

  // Combine all (child + parent + grandparent) — remove duplicates
  const allProductsMap = new Map();
  [...childProducts, ...parentProducts, ...grandParentProducts].forEach((p) => {
    allProductsMap.set(p.productSkuCode, p);
  });
  const validatedProducts = Array.from(allProductsMap.values());
  const missingErrors = [];

  validatedProducts.forEach((item) => {
    const mandatoryErrors = [];
    const businessErrors = [];

    // Mandatory field check
    const missing = PRODUCT_REQUIRED_FIELDS.filter((field) => item[field] == null || String(item[field]).trim() === '');
    mandatoryErrors.push(...missing);

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
    const allMandatory = Array.from(new Set(missingErrors.flatMap((e) => e.mandatory)));

    const allBusiness = Array.from(new Set(missingErrors.flatMap((e) => e.business)));

    const mandatoryMessage = allMandatory.length ? `${allMandatory.join(', ')} are missing.` : null;

    const businessMessage = allBusiness.length ? allBusiness : [];

    return {
      success: false,
      validProducts: [],
      message: {
        mandatoryMessage,
        businessMessage,
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
