import { safeNumber } from './commonHelper.js';
import { canonicalProductMapper } from './canonicalProductMapper.js'; // <-- IMPORT CANONICAL MAPPER
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { normalizeAndTranslateVariants } from '#root/src/integrations/erp/entegra/helpers/commonHelper.js';
import { processProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
export const collectedColors = new Map();

// MAIN MAPPER

import pLimit from 'p-limit';

const imageLimit = pLimit(5); //  max 5 concurrent image uploads
const imageCache = new Map();

const safeProcessImages = async (images = [], sellerId) => {
  if (!images.length) return [];

  const key = images.join('|');
  if (imageCache.has(key)) return imageCache.get(key);

  try {
    const uploaded = await imageLimit(() => processProductImages(images, sellerId));

    const safeImages = Array.isArray(uploaded) ? uploaded : [];
    imageCache.set(key, safeImages);
    return safeImages;
  } catch (e) {
    console.error('Image upload failed:', e.message);
    return [];
  }
};

const attachImages = (target, images) => {
  if (!Array.isArray(images) || images.length === 0) return;

  const cloned = [...images];

  Object.assign(target, {
    primaryImageUrl: cloned[0],
    imageUrl: cloned[0],
    extraImageUrl1: cloned[1] || null,
    extraImageUrl2: cloned[2] || null,
    extraImageUrl3: cloned[3] || null,
    images: cloned,
  });
};

export const mapProductToDB = async (sellerId, p, categoryName, isImageUpdate = false) => {
  const hasVariants = Array.isArray(p.variatios) && p.variatios.length > 0;

  // ================= IMAGES FROM API =================
  const baseImages = p.pictures?.map((i) => i?.picture).filter(Boolean) || [];

  const hasApiImages = baseImages.length > 0;

  // ================= META =================
  const grandParentSku = `${p.productCode}`;
  const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';
  const gender = /Kadın/i.test(p.name) ? 'Female' : /Erkek/i.test(p.name) ? 'Male' : 'Unisex';

  // ================= GRAND PARENT =================
  const gpPrice = await priceConverter(currency, parseFloat(p.namshi_fiyat) || 0);
  const gpSpecial = await priceConverter(currency, parseFloat(p.site_indirimli_fiyat) || 0);

  const grandParentObject = {
    sellerId,
    productType: hasVariants ? 'configurable' : 'simple',
    productSkuCode: grandParentSku,
    grandParentProductSkuCode: null,
    parentProductSkuCode: null,

    name: p.name?.trim(),
    description: htmlToPlainText(p.description),
    descriptionAr: p.descriptionAr || '',
    brand: p.brand || '',

    price: gpPrice,
    minPrice: gpSpecial,
    maxPrice: gpPrice,
    msrp: gpPrice,

    status: p.status === '1' ? 'active' : 'inactive',
    currentStockCount: safeNumber(p.quantity),

    volumetricWeightCm: safeNumber(p.desi, 1),
    hsCodeAE: '6403',
    hsCodeSA: '6403',

    categoryTrail: categoryName,
    gender,
    ageRangeDescription: 'Adult',
    manufacturer: p.supplier || '',
    modelName: p.mpn || '',
    source: 'MANUAL',
  };

  let grandParentImages = [];

  if (isImageUpdate === true && hasApiImages === true) {
    grandParentImages = await safeProcessImages(baseImages, sellerId);
    attachImages(grandParentObject, grandParentImages);
  }

  const grandParent = canonicalProductMapper(grandParentObject, sellerId);

  if (!hasVariants) {
    return { grandParent, parents: [], children: [] };
  }

  // ================= NORMALIZE VARIANTS =================
  const normalizedVariants = await normalizeAndTranslateVariants(p.variatios);

  // ================= GROUP BY COLOR =================
  const variantsByColor = normalizedVariants.reduce((acc, v) => {
    if (!v.normalizedColor) return acc;
    acc[v.normalizedColor] ||= [];
    acc[v.normalizedColor].push(v);
    return acc;
  }, {});

  const parents = [];
  const children = [];

  // ================= PARENTS & CHILDREN =================
  for (const [color, colorVariants] of Object.entries(variantsByColor)) {
    const parentSku = `${grandParentSku}_${color.replace(/\s+/g, '_')}`.slice(0, 64);

    const parentPrice = await priceConverter(currency, parseFloat(colorVariants[0]?.namshi_fiyat) || 0);
    const parentSpecial = await priceConverter(currency, parseFloat(colorVariants[0]?.site_indirimli_fiyat) || 0);

    const parentObject = {
      sellerId,
      productType: 'configurable',
      productSkuCode: parentSku,
      grandParentProductSkuCode: grandParentSku,

      name: `${p.name} - ${colorVariants[0]?.originalColor || color}`,
      description: htmlToPlainText(p.description),
      descriptionAr: p.descriptionAr || '',
      brand: p.brand || '',

      price: parentPrice,
      minPrice: parentSpecial,
      maxPrice: parentPrice,
      msrp: parentPrice,

      status: p.status === '1' ? 'active' : 'inactive',

      volumetricWeightCm: safeNumber(p.desi, 1),
      hsCodeAE: '6403',
      hsCodeSA: '6403',

      color: colorVariants[0]?.originalColor || color,
      categoryTrail: categoryName,
      gender,
      modelName: p.mpn || '',
    };

    // ---------- PARENT IMAGES ----------
    const rawParentImages = colorVariants[0]?.variation_pictures?.map((i) => i?.picture).filter(Boolean) || [];

    const hasParentApiImages = rawParentImages.length > 0;

    let parentImages = [];

    if (isImageUpdate === true && hasParentApiImages === true) {
      parentImages = await safeProcessImages(rawParentImages, sellerId);
    }

    // fallback ONLY if GP had API images
    if (!parentImages.length && hasApiImages) {
      parentImages = grandParentImages;
    }

    attachImages(parentObject, parentImages);

    parents.push(canonicalProductMapper(parentObject, sellerId));

    // ---------- CHILDREN ----------
    for (const v of colorVariants) {
      const safeColor = (v.originalColor || 'NA').trim().replace(/\s+/g, '_').toUpperCase();

      const childSku = `${v.productCode}_${safeColor}`.slice(0, 64);

      const childPrice = await priceConverter(currency, parseFloat(v.namshi_fiyat) || 0);
      const childSpecial = await priceConverter(currency, parseFloat(v.site_indirimli_fiyat) || 0);

      const childObject = {
        sellerId,
        productType: 'simple',
        productSkuCode: childSku,
        parentProductSkuCode: parentSku,

        name: `${p.name} - ${v.originalColor} - ${v.normalizedSize}`,
        description: htmlToPlainText(p.description),
        descriptionAr: p.descriptionAr || '',
        brand: p.brand || '',
        ean: v.barcode || v.gtin || '',

        price: childPrice,
        minPrice: childSpecial,
        maxPrice: childPrice,
        msrp: childPrice,

        status: p.status === '1' ? 'active' : 'inactive',
        currentStockCount: safeNumber(v.quantity),

        volumetricWeightCm: safeNumber(v.desi ?? p.desi, 1),
        hsCodeAE: '6403',
        hsCodeSA: '6403',

        size: v.normalizedSize,
        color: v.originalColor,
        categoryTrail: categoryName,
        gender,
        modelName: p.mpn || '',
      };

      if (isImageUpdate && parentImages.length) {
        attachImages(childObject, parentImages);
      }

      children.push(canonicalProductMapper(childObject, sellerId));
    }
  }

  return { grandParent, parents, children };
};
