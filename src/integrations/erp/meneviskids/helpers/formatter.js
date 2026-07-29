import { processProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
import { mapErpStyleImageFields } from '#helpers/productImageFields.js';
import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { filterValidHierarchyProducts } from '#root/src/helpers/ProductHierarchy.js';
import { MIN_STOCK } from '../constants/common.js';

const stripHtml = (html = '') => {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const toArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const cleanImages = (...imgGroups) => {
  const merged = imgGroups
    .flat()
    .filter(Boolean)
    .map((i) => (typeof i === 'string' ? i.trim() : ''))
    .filter(Boolean);
  return [...new Set(merged)];
};

export const extractSpecs = (specs) => {
  const specArray = toArray(specs);
  const colorSpec = specArray.find((s) => s?.['$']?.name === 'renk');
  const sizeSpec = specArray.find((s) => s?.['$']?.name === 'beden');
  return {
    color: (colorSpec?.['_'] || '').trim(),
    size: (sizeSpec?.['_'] || '').trim(),
  };
};

const buildCategoryTrail = (product) => {
  const main = (product.mainCategory || '').trim();
  const cat = (product.category || '').trim();
  const sub = (product.subCategory || '').trim();
  return [main, cat, sub].filter(Boolean).join(' > ');
};

const resolveVariantPrice = (product, variant) => {
  const direct = parseFloat(variant.price || 0);
  if (direct > 0) return direct;

  const fallbacks = [product.price2, product.price3, product.price4, product.price5, product.price6]
    .map((value) => parseFloat(value || 0))
    .filter((value) => value > 0);

  return fallbacks.length ? Math.max(...fallbacks) : 0;
};

const shouldUploadImages = (sku, existingSkus, isImageUpdate) => !existingSkus.has(sku) || isImageUpdate === true;

export const formatMeneviskidsProduct = async (
  raw = [],
  sellerId,
  isImageUpdate = false,
  existingSkus = new Set(),
  skipImages = false,
  sellerName
) => {
  if (!raw.length) return { products: [], categoryTrails: [] };

  const formatted = [];
  const categoryTrails = new Set();

  for (const product of raw) {
    const grandParentSku = (product.Product_code || '').trim();
    if (!grandParentSku) continue;

    const brandName = (product.Brand || '').trim() || sellerName || '';
    const categoryTrail = buildCategoryTrail(product);
    if (categoryTrail) categoryTrails.add(categoryTrail);

    // Filter variants that have both color and size specs and stock > 0
    const variants = toArray(product?.variants?.variant).filter((v) => {
      const { color, size } = extractSpecs(v.spec);
      return color && size && Number(v.quantity || 0) > 0;
    });

    if (!variants.length) continue;

    // Product-level images: Image1 through Image5
    const productImages = cleanImages(product.Image1, product.Image2, product.Image3, product.Image4, product.Image5);

    const uploadBaseImages = !skipImages && shouldUploadImages(grandParentSku, existingSkus, isImageUpdate);
    let baseProcessed = {};

    if (uploadBaseImages && productImages.length > 0) {
      const cdnImages = await processProductImages(productImages, sellerId);
      if (cdnImages.length > 0) {
        baseProcessed = mapErpStyleImageFields(cdnImages);
      }
    } else if (skipImages && productImages.length > 0) {
      baseProcessed = mapErpStyleImageFields(productImages);
    }

    const totalStock = variants.reduce((s, v) => s + Number(v.quantity || 0), 0);
    const grandParentPrice = await priceConverter(
      'TRL',
      Math.max(0, ...variants.map((v) => resolveVariantPrice(product, v)))
    );

    const base = {
      sellerId,
      name: (product.Name || '').trim(),
      description: stripHtml(product.Description || ''),
      brand: brandName,
      categoryTrail,
      vatRateType: Number(product.Tax || 0) > 0 ? 'STANDARD' : 'ZERO',
      ...baseProcessed,
      volumetricWeightCm: 0.3,
      updatedAt: new Date(),
    };

    // Grandparent (configurable, no color/size)
    formatted.push({
      ...base,
      productSkuCode: grandParentSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      price: grandParentPrice,
      noonPrice: grandParentPrice,
      namshiPrice: grandParentPrice,
      purchasePrice: grandParentPrice,
      msrp: grandParentPrice,
      currentStockCount: totalStock,
      status: totalStock >= MIN_STOCK ? 'active' : 'inactive',
      color: '',
      size: '',
      ean: (product.Barcode || '').trim(),
    });

    // Group variants by color
    const groupedByColor = variants.reduce((acc, v) => {
      const { color } = extractSpecs(v.spec);
      (acc[color] ||= []).push(v);
      return acc;
    }, {});

    for (const [color, colorVariants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      const parentStock = colorVariants.reduce((s, v) => s + Number(v.quantity || 0), 0);
      const parentPrice = await priceConverter(
        'TRL',
        Math.max(0, ...colorVariants.map((v) => resolveVariantPrice(product, v)))
      );

      // Parent (configurable, color only)
      formatted.push({
        ...base,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: grandParentSku,
        productType: 'configurable',
        color,
        size: '',
        ean: '',
        price: parentPrice,
        noonPrice: parentPrice,
        namshiPrice: parentPrice,
        purchasePrice: parentPrice,
        msrp: parentPrice,
        currentStockCount: parentStock,
        status: parentStock >= MIN_STOCK ? 'active' : 'inactive',
      });

      for (const variant of colorVariants) {
        const { size } = extractSpecs(variant.spec);
        const childSku = `${parentSku}-${(size || '').trim()}`;
        const variantStock = Number(variant.quantity || 0);
        const variantPrice = await priceConverter('TRL', resolveVariantPrice(product, variant));

        const uploadChildImages = !skipImages && shouldUploadImages(childSku, existingSkus, isImageUpdate);
        let childProcessed = {};

        const variantPictures = toArray(variant.picture).map((p) => (typeof p === 'string' ? p.trim() : ''));
        const mergedChildImages = cleanImages(...(base.images || productImages), ...variantPictures);

        if (uploadChildImages && mergedChildImages.length > 0) {
          const cdnChildImages = await processProductImages(mergedChildImages, sellerId);
          if (cdnChildImages.length > 0) {
            childProcessed = mapErpStyleImageFields(cdnChildImages);
          }
        } else if (skipImages && mergedChildImages.length > 0) {
          childProcessed = mapErpStyleImageFields(mergedChildImages);
        }

        formatted.push({
          ...base,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          ...childProcessed,
          color,
          size,
          ean: (variant.barcode || variant.gtin || '').trim(),
          price: variantPrice,
          noonPrice: variantPrice,
          namshiPrice: variantPrice,
          purchasePrice: variantPrice,
          msrp: variantPrice,
          minPrice: null,
          maxPrice: null,
          currentStockCount: variantStock,
          status: variantStock >= MIN_STOCK ? 'active' : 'inactive',
        });
      }
    }
  }

  return {
    products: filterValidHierarchyProducts(formatted, { requirePriceAndImage: true }),
    categoryTrails: [...categoryTrails],
  };
};
