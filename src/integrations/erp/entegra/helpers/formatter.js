import { safeNumber } from './commonHelper.js';
import { canonicalProductMapper } from './canonicalProductMapper.js'; // <-- IMPORT CANONICAL MAPPER
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import crypto from 'crypto';
import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import {
  mapImageUrls,
  normalizeAndTranslateVariants,
  resolveImages,
} from '#root/src/integrations/erp/entegra/helpers/commonHelper.js';

export const collectedColors = new Map();

// MAIN MAPPER

export const mapProductToDB = async (sellerId, p, categoryName) => {
  const hasVariants = Array.isArray(p.variatios) && p.variatios.length > 0;

  // IMAGES

  const baseImages = p.pictures?.map((i) => i?.picture).filter(Boolean) || [];

  // SKU & CURRENCY

  const grandParentSku = `${p.productCode}`;
  const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';
  const gender = /Kadın/i.test(p.name) ? 'Female' : /Erkek/i.test(p.name) ? 'Male' : 'Unisex';

  // GRANDPARENT

  const gpPrice = await priceConverter(currency, parseFloat(p.site_fiyat) || 0);
  const gpSpecial = await priceConverter(currency, parseFloat(p.site_indirimli_fiyat) || 0);

  const grandParent = canonicalProductMapper(
    {
      sellerId,
      productType: hasVariants ? 'configurable' : 'simple',

      productSkuCode: grandParentSku,
      grandParentProductSkuCode: null,
      parentProductSkuCode: null,

      name: p.name?.trim(),
      description: htmlToPlainText(p.description),
      descriptionAr: p.descriptionAr || '',
      brand: p.brand || '',

      price: gpSpecial || gpPrice,
      minPrice: gpSpecial,
      maxPrice: gpPrice,
      msrp: gpPrice,

      status: p.status === '1' ? 'active' : 'inactive',
      currentStockCount: safeNumber(p.quantity),

      volumetricWeightCm: safeNumber(p.desi, 1),
      hsCodeAE: '6403',
      hsCodeSA: '6403',

      images: baseImages,
      ...mapImageUrls(baseImages),

      categoryTrail: categoryName,
      gender,
      ageRangeDescription: 'Adult',
      manufacturer: p.supplier || '',
      modelName: p.mpn || '',
      source: 'MANUAL',
    },
    sellerId
  );

  if (!hasVariants) return { grandParent, parents: [], children: [] };

  // NORMALIZE VARIANTS

  const normalizedVariants = await normalizeAndTranslateVariants(p.variatios);

  // COLLECT COLORS (GLOBAL MAP)

  for (const v of normalizedVariants) {
    if (!v.normalizedColor) continue;

    if (!collectedColors.has(v.normalizedColor)) {
      collectedColors.set(v.normalizedColor, {
        original: v.originalColor,
        normalized: v.normalizedColor,
      });
    }
  }

  // GROUP BY COLOR (PARENT)

  const variantsByColor = normalizedVariants.reduce((acc, v) => {
    acc[v.normalizedColor] = acc[v.normalizedColor] || [];
    acc[v.normalizedColor].push(v);
    return acc;
  }, {});

  const parents = [];
  const children = [];

  // PARENTS & CHILDREN

  for (const [color, colorVariants] of Object.entries(variantsByColor)) {
    const parentSku = `${grandParentSku}_${color.replace(/\s+/g, '_')}`.slice(0, 64);
    const parentImages = resolveImages(colorVariants[0]?.variation_pictures?.map((i) => i?.picture) || [], baseImages);

    const parentPrice = await priceConverter(currency, parseFloat(colorVariants[0]?.site_fiyat) || 0);
    const parentSpecial = await priceConverter(currency, parseFloat(colorVariants[0]?.site_indirimli_fiyat) || 0);

    parents.push(
      canonicalProductMapper(
        {
          sellerId,
          productType: 'configurable',
          productSkuCode: parentSku,
          grandParentProductSkuCode: grandParentSku,

          name: `${p.name} - ${colorVariants[0]?.originalColor || color}`,
          description: htmlToPlainText(p.description),
          descriptionAr: p.descriptionAr || '',
          brand: p.brand || '',

          price: parentSpecial || parentPrice,
          minPrice: parentSpecial,
          maxPrice: parentPrice,
          msrp: parentPrice,

          status: p.status === '1' ? 'active' : 'inactive',

          volumetricWeightCm: safeNumber(p.desi, 1),
          hsCodeAE: '6403',
          hsCodeSA: '6403',

          images: parentImages,
          ...mapImageUrls(parentImages),

          color: colorVariants[0]?.originalColor || color,
          categoryTrail: categoryName,
          gender,
          modelName: p.mpn || '',
        },
        sellerId
      )
    );

    // CHILD VARIANTS
    for (const v of colorVariants) {
      const size = v.normalizedSize;
      const childImages = resolveImages(v.variation_pictures?.map((i) => i?.picture) || [], parentImages);

      const childPrice = await priceConverter(currency, parseFloat(v.site_fiyat) || 0);
      const childSpecial = await priceConverter(currency, parseFloat(v.site_indirimli_fiyat) || 0);
      children.push(
        canonicalProductMapper(
          {
            sellerId,
            productType: 'simple',

            productSkuCode: v.productCode || crypto.randomUUID(),
            parentProductSkuCode: parentSku,

            name: `${p.name} - ${v.originalColor} - ${size}`,
            description: htmlToPlainText(p.description),
            descriptionAr: p.descriptionAr || '',
            brand: p.brand || '',
            ean: v.barcode || v.gtin || '',

            price: childSpecial || childPrice,
            minPrice: childSpecial,
            maxPrice: childPrice,
            msrp: childPrice,

            status: p.status === '1' ? 'active' : 'inactive',
            currentStockCount: safeNumber(v.quantity),

            volumetricWeightCm: safeNumber(v.desi ?? p.desi, 1),
            hsCodeAE: '6403',
            hsCodeSA: '6403',

            images: childImages,
            ...mapImageUrls(childImages),

            size,
            color: v.originalColor,
            categoryTrail: categoryName,
            gender,
            modelName: p.mpn || '',
          },
          sellerId
        )
      );
    }
  }

  return { grandParent, parents, children };
};
