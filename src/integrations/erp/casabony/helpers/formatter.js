import { MIN_STOCK } from '../constants/common.js';
import { mapErpStyleImageFields } from '#helpers/productImageFields.js';
import { filterValidHierarchyProducts } from '#root/src/helpers/ProductHierarchy.js';

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const cleanImages = (...imgGroups) => {
  const merged = imgGroups
    .flat()
    .filter(Boolean)
    .map((i) => (typeof i === 'string' ? i.trim() : i?._ || ''));
  return [...new Set(merged)].filter(Boolean);
};

const extractSubproductImages = (subproducts) => subproducts.flatMap((sub) => cleanImages(sub?.Resimler?.Resim));

const shouldUploadImages = (sku, existingSkus, isImageUpdate) => {
  const isNewSku = !existingSkus.has(sku);
  if (isNewSku) return true;
  return isImageUpdate === true;
};

const formatBaseProduct = async (product, sellerId, subproductImages, uploadImages) => {
  const rawImages = cleanImages(product?.Resimler?.Resim, subproductImages);

  let processed = {};

  if (uploadImages) {
    // Directly map raw URLs to DB (skipping S3 upload for testing)
    processed = mapErpStyleImageFields(rawImages);

    // To upload to S3 in production, use:
    // const cdnImages = await processProductImages(rawImages, sellerId);
    // processed = cdnImages.length > 0 ? mapErpStyleImageFields(cdnImages) : {};
  }

  return {
    sellerId,
    name: product.UrunAdi || '',
    description: product.Aciklama || '',
    brand: 'Casabony',
    categoryTrail: product.KategoriTree || '',
    vatRateType: 'STANDARD',
    ...processed,
    volumetricWeightCm: 0.3,
    hsCodeAE: '',
    hsCodeSA: '',
    updatedAt: new Date(),
  };
};

export const formatCasabonyProducts = async (raw = [], sellerId, isImageUpdate = false, existingSkus = new Set()) => {
  if (!raw.length) return { products: [], categoryTrails: [] };

  const formatted = [];
  const categoryTrails = new Set();
  for (const product of raw) {
    if (product.KategoriTree) categoryTrails.add(product.KategoriTree);
    const subproducts = toArray(product?.UrunSecenek?.Secenek);
    const subproductImages = extractSubproductImages(subproducts);
    const grandParentSku = (product.OzelAlan1 || product.UrunKartiID || '').trim();
    if (!grandParentSku) continue;

    const uploadBaseImages = shouldUploadImages(grandParentSku, existingSkus, isImageUpdate);
    const base = await formatBaseProduct(product, sellerId, subproductImages, uploadBaseImages);
    if (base.categoryTrail) categoryTrails.add(base.categoryTrail);

    const totalStock = subproducts.reduce((s, v) => s + Number(v.StokAdedi || 0), 0);
    const priceSpecial = parseFloat(product.IndirimliFiyati || product.SatisFiyati || 0);

    formatted.push({
      ...base,
      productSkuCode: grandParentSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      price: priceSpecial,
      noonPrice: priceSpecial,
      namshiPrice: priceSpecial,
      purchasePrice: priceSpecial,
      msrp: priceSpecial,
      currentStockCount: totalStock,
      status: totalStock < MIN_STOCK ? 'inactive' : 'active',
      color: '',
      size: '',
      ean: '',
    });

    if (!subproducts.length) continue;

    const groupedByColor = subproducts.reduce((acc, sub) => {
      const ozellikler = toArray(sub?.EkSecenekOzellik?.Ozellik);
      const colorObj = ozellikler.find((o) => o.$?.Tanim === 'Renk');
      const color = (colorObj?._ || '').trim();
      (acc[color] ||= []).push(sub);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color ? color.replace(/\s+/g, '_').toUpperCase() : '';
      const parentSku = safeColor ? `${grandParentSku}-${safeColor}` : grandParentSku;
      const parentStock = variants.reduce((s, v) => s + Number(v.StokAdedi || 0), 0);

      formatted.push({
        ...base,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: grandParentSku,
        productType: 'configurable',
        color,
        size: '',
        ean: '',
        price: priceSpecial,
        noonPrice: priceSpecial,
        namshiPrice: priceSpecial,
        purchasePrice: priceSpecial,
        msrp: priceSpecial,
        currentStockCount: parentStock,
        status: parentStock < MIN_STOCK ? 'inactive' : 'active',
      });

      for (const variant of variants) {
        const ozellikler = toArray(variant?.EkSecenekOzellik?.Ozellik);
        const sizeObj = ozellikler.find((o) => o.$?.Tanim === 'Beden');
        const size = (sizeObj?._ || '').trim();
        const safeSize = size ? size.replace(/\s+/g, '_').toUpperCase() : '';

        const childSku = (variant.StokKodu || (safeSize ? `${parentSku}-${safeSize}` : parentSku)).trim();
        const uploadChildImages = shouldUploadImages(childSku, existingSkus, isImageUpdate);

        let processedChild = {};

        if (uploadChildImages) {
          const variantImgs = cleanImages(variant?.Resimler?.Resim);
          const mergedChildImages = cleanImages(...(base.images || []), ...variantImgs);

          if (mergedChildImages.length > 0) {
            processedChild = mapErpStyleImageFields(mergedChildImages);
          } else {
            processedChild = {};
          }
        }

        const childPrice = parseFloat(variant.IndirimliFiyati || variant.SatisFiyati || priceSpecial);

        formatted.push({
          ...base,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          ...processedChild,
          price: childPrice,
          noonPrice: childPrice,
          namshiPrice: childPrice,
          msrp: childPrice,
          minPrice: null,
          maxPrice: null,
          purchasePrice: childPrice,
          color,
          size,
          ean: variant.Barkod || '',
          currentStockCount: Number(variant.StokAdedi || 0),
          status: Number(variant.StokAdedi) < MIN_STOCK ? 'inactive' : 'active',
        });
      }
    }
  }

  return {
    products: filterValidHierarchyProducts(formatted, { requirePriceAndImage: true, existingSkus }),
    categoryTrails: [...categoryTrails],
  };
};
