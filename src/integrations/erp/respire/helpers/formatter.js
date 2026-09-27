import { safeNumber, convertRespireChannelPrices, buildSkuHierarchy, buildChildSku } from './commonHelper.js';
import { canonicalProductMapper } from './canonicalProductMapper.js'; // <-- IMPORT CANONICAL MAPPER
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { normalizeAndTranslateVariants } from '#root/src/integrations/erp/respire/helpers/commonHelper.js';
import { mapErpStyleImageFields } from '#helpers/productImageFields.js';
import { processProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
export const collectedColors = new Map();

// MAIN MAPPER

const attachImages = (target, images) => {
  if (!Array.isArray(images) || images.length === 0) return;

  Object.assign(target, mapErpStyleImageFields(images));
};

const extractPicturesSafely = (pictures = []) => {
  if (!Array.isArray(pictures) || !pictures.length) return [];

  // Helper to extract numerical sequence from image filename (e.g. "...-6585.jpg" -> 6585)
  const getImageSequenceNum = (item) => {
    const url = typeof item === 'string' ? item : item?.picture || '';
    const m = url.match(/(\d+)\.(jpg|jpeg|png|webp)/i);
    return m ? parseInt(m[1], 10) : 99999999;
  };

  // 1. Check if any picture has explicit order/is_main/sort attributes from Respire
  const hasOrderFlags = pictures.some(
    (p) => p && (p.order != null || p.order_number != null || p.is_main != null || p.main != null || p.sort != null)
  );

  if (hasOrderFlags) {
    const sorted = [...pictures].sort((a, b) => {
      const aIsMain =
        a?.is_main === true || a?.is_main === 1 || a?.is_main === '1' || a?.main === true || a?.main === 1;
      const bIsMain =
        b?.is_main === true || b?.is_main === 1 || b?.is_main === '1' || b?.main === true || b?.main === 1;
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;

      const aOrder = Number(a?.order ?? a?.order_number ?? a?.sort);
      const bOrder = Number(b?.order ?? b?.order_number ?? b?.sort);
      const safeA = isNaN(aOrder) ? 9999 : aOrder;
      const safeB = isNaN(bOrder) ? 9999 : bOrder;
      return safeA - safeB;
    });
    return sorted.map((i) => (typeof i === 'string' ? i : i?.picture)).filter(Boolean);
  }

  // 2. Sort images numerically by ID
  const sorted = [...pictures]
    .map((i) => (typeof i === 'string' ? i : i?.picture))
    .filter(Boolean)
    .sort((a, b) => getImageSequenceNum(a) - getImageSequenceNum(b));

  if (sorted.length <= 3) return sorted;

  // 3. Group into consecutive photoshoot clusters (ID difference <= 5)
  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevNum = getImageSequenceNum(sorted[i - 1]);
    const currNum = getImageSequenceNum(sorted[i]);

    if (currNum - prevNum <= 5) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    }
  }
  if (currentCluster.length) clusters.push(currentCluster);

  // 4. Put the largest studio catalog pack first
  clusters.sort((a, b) => b.length - a.length);

  return clusters.flat();
};

export const mapProductToDB = async (sellerId, p, categoryName, isImageUpdate = true) => {
  const hasVariants = Array.isArray(p.variatios) && p.variatios.length > 0;

  // ================= IMAGES FROM API (Direct URLs) =================
  const grandParentImages = extractPicturesSafely(p.pictures);

  const hasAnyPictures =
    grandParentImages.length > 0 ||
    (hasVariants &&
      p.variatios.some(
        (v) =>
          Array.isArray(v?.variation_pictures) &&
          v.variation_pictures.some((vp) => (typeof vp === 'string' ? vp : vp?.picture))
      ));

  // Skip formatting / storing if product has no images
  if (!hasAnyPictures) {
    return { parents: [], children: [] };
  }

  // ================= META =================
  const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';
  const gender = /Kadın/i.test(p.name) ? 'Female' : /Erkek/i.test(p.name) ? 'Male' : 'Unisex';

  // ================= GRAND PARENT =================
  const gpPrices = await convertRespireChannelPrices(currency, p);

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
    const { grandParentSku, parentSku } = buildSkuHierarchy(p.productCode, colorVariants[0]?.originalColor || color);

    const parentObject = {
      sellerId,
      productType: 'configurable',
      productSkuCode: parentSku,
      grandParentProductSkuCode: grandParentSku,

      name: `${p.name}`,
      description: htmlToPlainText(p.description),
      descriptionAr: p.descriptionAr || '',
      brand: p.brand,

      price: gpPrices.price,
      minPrice: gpPrices.specialPrice,
      maxPrice: gpPrices.price,
      msrp: gpPrices.price,

      status: p.status === '1' ? 'active' : 'inactive',

      volumetricWeightCm: safeNumber(p.desi, 1),
      hsCodeAE: '6403',
      hsCodeSA: '6403',

      color: colorVariants[0]?.originalColor || color,
      categoryTrail: categoryName,
      gender,
      modelName: p.mpn || '',

      currentStockCount: safeNumber(p.quantity),
      noonPrice: gpPrices.noonPrice,
      namshiPrice: gpPrices.namshiPrice,
      amazonPrice: gpPrices.amazonPrice,
      sixthStreetPrice: gpPrices.sixthStreetPrice,
      styliPrice: gpPrices.styliPrice,
    };

    // ---------- PARENT IMAGES ----------
    const variantWithPics = colorVariants.find(
      (v) => Array.isArray(v.variation_pictures) && v.variation_pictures.length > 0
    );
    const rawParentImages = extractPicturesSafely(variantWithPics?.variation_pictures || []);

    const parentImages = rawParentImages.length > 0 ? rawParentImages : grandParentImages;

    let processedParentImages = [];
    if (isImageUpdate && parentImages.length) {
      processedParentImages = await processProductImages(parentImages, sellerId);
      if (processedParentImages.length > 0) {
        attachImages(parentObject, processedParentImages);
      }
    }

    parents.push(canonicalProductMapper(parentObject, sellerId));

    // ---------- CHILDREN ----------
    for (const v of colorVariants) {
      const childSku = buildChildSku(parentSku, v.normalizedSize || v.originalSize);

      // Respire never populates per-variant prices (confirmed against live data) —
      // each price falls back to the parent's when the variant's own is 0.
      const childPrices = await convertRespireChannelPrices(currency, v, gpPrices);

      const childObject = {
        sellerId,
        productType: 'simple',
        productSkuCode: childSku,
        parentProductSkuCode: parentSku,
        grandParentProductSkuCode: grandParentSku,

        name: `${p.name}`,
        description: htmlToPlainText(p.description),
        descriptionAr: p.descriptionAr || '',
        brand: p.brand,
        ean: v.barcode || v.gtin || '',

        price: childPrices.price,
        minPrice: childPrices.specialPrice,
        maxPrice: childPrices.price,
        msrp: childPrices.price,

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
        noonPrice: childPrices.noonPrice,
        namshiPrice: childPrices.namshiPrice,
        amazonPrice: childPrices.amazonPrice,
        sixthStreetPrice: childPrices.sixthStreetPrice,
        styliPrice: childPrices.styliPrice,
      };

      const rawChildImages = extractPicturesSafely(v.variation_pictures || []);

      if (isImageUpdate) {
        if (rawChildImages.length > 0) {
          const processedChildImages = await processProductImages(rawChildImages, sellerId);
          if (processedChildImages.length > 0) {
            attachImages(childObject, processedChildImages);
          }
        } else if (processedParentImages.length > 0) {
          attachImages(childObject, processedParentImages);
        }
      }

      children.push(canonicalProductMapper(childObject, sellerId));
    }
  }

  return { parents, children };
};
