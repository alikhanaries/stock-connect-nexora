import { safeNumber, convertCodeFormat } from './commonHelper.js';
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
  const grandParentSku = `${convertCodeFormat(p.productCode)}`;
  const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';
  const gender = /Kadın/i.test(p.name) ? 'Female' : /Erkek/i.test(p.name) ? 'Male' : 'Unisex';

  // ================= GRAND PARENT =================
  const gpPrice = await priceConverter(currency, parseFloat(p.namshi_fiyat) || 0);
  const gpSpecial = await priceConverter(currency, parseFloat(p.site_indirimli_fiyat) || 0);

  let grandParentImages = [];

  if (isImageUpdate === true && hasApiImages === true) {
    grandParentImages = await safeProcessImages(baseImages, sellerId);
  }

  if (!hasVariants) {
    return { parents: [], children: [] };
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
    const parentSku = `${convertCodeFormat(grandParentSku)}`;

    const parentObject = {
      sellerId,
      productType: 'configurable',
      productSkuCode: parentSku,
      grandParentProductSkuCode: null,

      name: `${p.name}`,
      description: htmlToPlainText(p.description),
      descriptionAr: p.descriptionAr || '',

      brand: 'manijero',
      price: gpPrice,
      minPrice: gpSpecial,
      maxPrice: gpPrice,
      msrp: gpPrice,

      status: p.status === '1' ? 'active' : 'inactive',

      volumetricWeightCm: safeNumber(p.desi, 1),
      hsCodeAE: '6403',
      hsCodeSA: '6403',

      color: colorVariants[0]?.originalColor || color,
      categoryTrail: categoryName,
      gender,
      modelName: p.mpn || '',

      currentStockCount: safeNumber(p.quantity),
      noonPrice: gpPrice || 0,
      namshiPrice: gpPrice || 0,
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
      const childSku = convertCodeFormat(v.productCode);

      const childPrice = await priceConverter(currency, parseFloat(v.namshi_fiyat) || 0);
      const childSpecial = await priceConverter(currency, parseFloat(v.site_indirimli_fiyat) || 0);

      const childObject = {
        sellerId,
        productType: 'simple',
        productSkuCode: childSku,
        parentProductSkuCode: parentSku,

        name: `${p.name}`,
        description: htmlToPlainText(p.description),
        descriptionAr: p.descriptionAr || '',
        brand: 'manijero',
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
        noonPrice: childPrice || 0,
        namshiPrice: childPrice || 0,
      };

      if (isImageUpdate && parentImages.length) {
        attachImages(childObject, parentImages);
      }

      children.push(canonicalProductMapper(childObject, sellerId));
    }
  }

  return { parents, children };
};
