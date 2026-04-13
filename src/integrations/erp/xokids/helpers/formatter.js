import { processProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
import { MIN_STOCK } from '../constants/common.js';

const toArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const cleanImages = (...imgGroups) => {
  const merged = imgGroups
    .flat()
    .filter(Boolean)
    .map((i) => i.trim());
  return [...new Set(merged)];
};

const extractSubproductImages = (subproducts) =>
  subproducts.flatMap((sub) => cleanImages(sub.image_url, toArray(sub.img_item)));

const shouldUploadImages = (sku, existingSkus, isImageUpdate) => {
  const isNewSku = !existingSkus.has(sku);
  if (isNewSku) return true;
  return isImageUpdate === true;
};

const formatBaseProduct = async (product, sellerId, subproductImages, uploadImages) => {
  const imgItems = toArray(product.img_item).map((i) => i?.trim());
  const rawImages = cleanImages(product.image_url, product.additional_image_url, imgItems, subproductImages);

  let processed = {};

  if (uploadImages) {
    const cdnImages = await processProductImages(rawImages, sellerId);
    if (cdnImages.length > 0) {
      processed = {
        primaryImageUrl: cdnImages[0],
        imageUrl: cdnImages[0],
        extraImageUrl1: cdnImages[1] || null,
        extraImageUrl2: cdnImages[2] || null,
        extraImageUrl3: cdnImages[3] || null,
        images: cdnImages,
      };
    } else {
      processed = {};
    }
  }

  return {
    sellerId,
    name: product.name,
    description: product.details,
    brand: 'XO Kids',
    categoryTrail: product.category_path,
    vatRateType: product.vat && Number(product.vat) > 0 ? 'STANDARD' : 'ZERO',
    ...processed,
    volumetricWeightCm: parseFloat(product.weight || product.desi || 0.3),
    hsCodeAE: product.ws_code || product.code,
    hsCodeSA: product.ws_code || product.code,
    updatedAt: new Date(),
  };
};

export const formatXokidsProduct = async (raw = [], sellerId, isImageUpdate = false, existingSkus = new Set()) => {
  if (!raw.length) return { products: [], categoryTrails: [] };

  const formatted = [];
  const categoryTrails = new Set();

  for (const product of raw) {
    if (product.category_path) categoryTrails.add(product.category_path);

    const subproducts = toArray(product?.subproducts?.subproduct).filter(
      (s) => (s.type1 || '').trim() && (s.type2 || '').trim()
    );

    // Skip products that have no valid subproducts (must have both color + size)
    if (!subproducts.length) continue;

    const subproductImages = extractSubproductImages(subproducts);
    const grandParentSku = product.ws_code || product.code;
    const uploadBaseImages = shouldUploadImages(grandParentSku, existingSkus, isImageUpdate);
    const base = await formatBaseProduct(product, sellerId, subproductImages, uploadBaseImages);

    if (base.categoryTrail) categoryTrails.add(base.categoryTrail);

    const totalStock = subproducts.reduce((s, v) => s + Number(v.variant_stock || v.stock || 0), 0);

    // Grandparent product
    formatted.push({
      ...base,
      productSkuCode: grandParentSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      price: parseFloat(product.price_special_vat_included || product.price_special || 0),
      noonPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
      namshiPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
      purchasePrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
      msrp: parseFloat(product.price_special_vat_included || product.price_special || 0),
      currentStockCount: totalStock,
      status: totalStock < MIN_STOCK ? 'inactive' : 'active',
      color: '',
      size: '',
      ean: product.barcode || '',
    });

    // Group subproducts by color (type1 in xokids)
    const groupedByColor = subproducts.reduce((acc, sub) => {
      const color = (sub.type1 || '').trim();
      (acc[color] ||= []).push(sub);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      const parentStock = variants.reduce((s, v) => s + Number(v.variant_stock || v.stock || 0), 0);

      // Parent product (per color)
      formatted.push({
        ...base,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: grandParentSku,
        productType: 'configurable',
        color,
        size: '',
        ean: '',
        price: parseFloat(product.price_special_vat_included || product.price_special || 0),
        noonPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
        namshiPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
        purchasePrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
        msrp: parseFloat(product.price_special_vat_included || product.price_special || 0),
        currentStockCount: parentStock,
        status: parentStock < MIN_STOCK ? 'inactive' : 'active',
      });

      // Child products (per size/type2)
      for (const variant of variants) {
        const size = (variant.type2 || '').trim();
        const safeSize = size.replace(/\s+/g, '_').toUpperCase();
        const childSku = `${parentSku}-${safeSize}`;
        const uploadChildImages = shouldUploadImages(childSku, existingSkus, isImageUpdate);

        let processedChild = {};

        if (uploadChildImages) {
          const variantImgs = cleanImages(variant.image_url, toArray(variant.img_item));
          const mergedChildImages = cleanImages(...(base.images || []), ...variantImgs);

          if (mergedChildImages.length > 0) {
            processedChild = {
              primaryImageUrl: mergedChildImages[0],
              imageUrl: mergedChildImages[0],
              extraImageUrl1: mergedChildImages[1] || null,
              extraImageUrl2: mergedChildImages[2] || null,
              extraImageUrl3: mergedChildImages[3] || null,
              images: mergedChildImages,
            };
          } else {
            processedChild = {};
          }
        }

        formatted.push({
          ...base,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          ...processedChild,
          price: parseFloat(product.price_special_vat_included || product.price_special || 0),
          noonPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
          namshiPrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
          msrp: parseFloat(product.price_special_vat_included || product.price_special || 0),
          minPrice: null,
          maxPrice: null,
          purchasePrice: parseFloat(product.price_special_vat_included || product.price_special || 0),
          color,
          size,
          ean: variant.barcode || '',
          currentStockCount: Number(variant.variant_stock || variant.stock || 0),
          status: Number(variant.variant_stock || variant.stock || 0) < MIN_STOCK ? 'inactive' : 'active',
        });
      }
    }
  }

  return {
    products: formatted,
    categoryTrails: [...categoryTrails],
  };
};
