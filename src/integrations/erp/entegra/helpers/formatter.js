// #helpers/productMapper.js
import { extractImages, extractMainImage, safeNumber } from './commonHelper.js'; // your existing helpers

export const mapProductToDB = (sellerId, p) => {
  const hasVariants = Array.isArray(p.variatios) && p.variatios.length > 0;

  // MAIN PRODUCT (PARENT / CONFIGURABLE)
  const parentSku = p.productCode || `parent_${Date.now()}`;
  const parentName = p.name?.trim() || parentSku;

  const parentData = {
    sellerId,

    // product type
    productType: hasVariants ? 'configurable' : 'simple',

    // SKU Hierarchy
    grandParentProductSkuCode: hasVariants ? parentSku : null,
    parentProductSkuCode: null,
    productSkuCode: parentSku,

    // base info
    name: parentName,
    description: p.description || '',
    brand: p.brand || '',
    ean: p.barcode || '',
    price: safeNumber(p.price1),
    purchasePrice: safeNumber(p.buying_price),
    currentStockCount: safeNumber(p.quantity),

    volumetricWeightCm: safeNumber(p.desi, 1),
    hsCodeAE: '0000',
    hsCodeSA: '0000',

    primaryImageUrl: extractMainImage(p.pictures),
    images: extractImages(p.pictures),
  };

  // VARIANTS (CHILD PRODUCTS)
  const variants = hasVariants
    ? p.variatios.map((v) => {
        const variantSku = v.productCode || `variant_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        return {
          sellerId,

          // Type always child for variations
          productType: 'simple',

          // SKU hierarchy
          grandParentProductSkuCode: parentSku,
          parentProductSkuCode: parentSku,
          productSkuCode: variantSku,

          // Product data
          name: v.name?.trim() || `${parentName} - ${v.variationSpec?.map((s) => s.value).join(' / ')}`,
          description: p.description || '',
          brand: p.brand || '',
          ean: v.barcode || v.gtin || '',
          price: safeNumber(v.price1 || v.price),
          purchasePrice: safeNumber(v.buying_price),
          currentStockCount: safeNumber(v.quantity),

          volumetricWeightCm: safeNumber(v.desi, 1),
          hsCodeAE: '0000',
          hsCodeSA: '0000',

          // dimensions
          height: safeNumber(v.height),
          width: safeNumber(v.width),
          weight: safeNumber(v.weight),
          depth: safeNumber(v.depth),

          // images & attributes
          imageUrl: extractMainImage(v.variation_pictures),
          attributes: JSON.stringify(v.variationSpec || []),
        };
      })
    : [];

  return { parent: parentData, variants };
};
