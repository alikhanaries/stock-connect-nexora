import mongoose from 'mongoose';
import { pickNamedImageFields, EXTRA_IMAGE_URL_KEYS } from '#helpers/productImageFields.js';

export const canonicalProductMapper = (item = {}, sellerId) => {
  if (!item) return null;

  return {
    sellerId: new mongoose.Types.ObjectId(sellerId),

    // SKU hierarchy
    grandParentProductSkuCode: item.grandParentProductSkuCode || null,
    parentProductSkuCode: item.parentProductSkuCode || null,
    productSkuCode: item.productSkuCode,

    // Names & Description
    name: item.name || '',
    nameAr: item.nameAr || '',
    description: item.description || '',
    descriptionAr: item.descriptionAr || '',

    // Brand & attributes
    brand: item.brand || '',
    attributes: item.attributes || '',

    // Identifiers
    ean: item.ean || '',

    // Pricing
    price: item.price || 0,
    minPrice: item.minPrice || 0,
    maxPrice: item.maxPrice || 0,
    msrp: item.msrp || 0,
    purchasePrice: item.purchasePrice || 0,
    vatRateType: item.vatRateType || 'STANDARD',

    // Status
    status: item.status || 'active',

    // Stock
    currentStockCount: item.currentStockCount || 0,

    // Logistics
    shippingCost: item.shippingCost || 0,
    shippingTime: item.shippingTime || '',
    isFrozen: Boolean(item.isFrozen),

    // Images (only include if images are provided/updated)
    ...(() => {
      if (!item.primaryImageUrl && !item.imageUrl && (!Array.isArray(item.images) || item.images.length === 0)) {
        return {};
      }
      const imgs = pickNamedImageFields({ ...item, images: item.images || [] });
      return {
        primaryImageUrl: imgs.primaryImageUrl || '',
        imageUrl: imgs.imageUrl || '',
        images: imgs.images || [],
        ...Object.fromEntries(EXTRA_IMAGE_URL_KEYS.map((key) => [key, imgs[key] || ''])),
      };
    })(),

    // Categories
    categoryTrail: item.categoryTrail || '',
    categoryTrailAmazon: item.categoryTrailAmazon || null,
    categoryTrailNoon: item.categoryTrailNoon || null,
    categoryTrailTrendyol: item.categoryTrailTrendyol || null,
    marketPlace: item.marketPlace || '',

    // Dimensions & weight
    volumetricWeightCm: item.volumetricWeightCm || 0,
    itemLength: item.itemLength || '',
    itemWidth: item.itemWidth || '',
    itemHeight: item.itemHeight || '',

    // HS Codes
    hsCodeAE: item.hsCodeAE || '0000',
    hsCodeSA: item.hsCodeSA || '0000',

    // Variant attributes
    size: item.size || '',
    sizeType: item.sizeType || 'Alpha',
    color: item.color || '',
    gender: item.gender || 'Unisex',
    ageRangeDescription: item.ageRangeDescription || 'Adult',

    // Apparel details
    apparelSizeBodyType: item.apparelSizeBodyType || 'Regular',
    bottomsHeightType: item.bottomsHeightType || 'Regular',
    specialSize: item.specialSize || 'Standard',
    closureType: item.closureType || 'Pull On',
    fitType: item.fitType || 'Regular',

    // Extra product information
    productCareInstructions: item.productCareInstructions || '',
    countryOfOrigin: item.countryOfOrigin || '',
    departmentName: item.departmentName || '',
    fabricType: item.fabricType || '',
    style: item.style || '',
    weaveType: item.weaveType || '',
    material: item.material || '',
    scent: item.scent || '',
    itemForm: item.itemForm || '',
    lifestyle: item.lifestyle || '',
    specialFeature: item.specialFeature || '',
    bulletPoint: item.bulletPoint || '',
    searchTerms: item.searchTerms || '',
    manufacturer: item.manufacturer || '',
    targetAudienceKeyword: item.targetAudienceKeyword || '',
    hairType: item.hairType || '',
    ingredientsList: item.ingredientsList || '',
    safetyWarning: item.safetyWarning || '',
    intendedUse: item.intendedUse || '',
    productBenefit: item.productBenefit || '',

    // Units / counts
    unitCount: item.unitCount || 0,
    unitCountType: item.unitCountType || '',
    numberOfItems: item.numberOfItems || 1,

    // Flags
    heatSensitive: Boolean(item.heatSensitive),
    liquidContents: Boolean(item.liquidContents),

    // Model
    modelName: item.modelName || '',

    // Product type
    productType: item.productType || 'simple',

    noonPrice: item.noonPrice || 0,
    namshiPrice: item.namshiPrice || 0,
    amazonPrice: item.amazonPrice || 0,
    sixthStreetPrice: item.sixthStreetPrice || 0,
    styliPrice: item.styliPrice || 0,
  };
};
