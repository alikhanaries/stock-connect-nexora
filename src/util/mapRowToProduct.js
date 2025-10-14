// mapRowToProduct.js
import { uploadImageFromUrl } from '../util/uploadImage.js';
export const mapRowToProduct = async (row, index, locale, sellerId) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys (lowercase + trim)
  const r = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value ? String(value).trim() : ''])
  );

  // CHECK MANDATORY FIELD
  const price = parseFloat(r.price);
  if (!r.productskucode || isNaN(price) || !r.categorytrail) {
    let errorData = [];
    if (!r.productskucode) {
      errorData.push(locale.PRODUCT_SKUCODE_MISSING);
    }
    if (isNaN(price)) {
      errorData.push(locale.PRODUCT_PRICE_MISSING);
    }
    if (!r.categorytrail) {
      errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
    }
    return {
      rowNumber: index,
      errorData,
    };
  }

  // Upload images to S3
  const s3Url = r.url ? await uploadImageFromUrl(r.url, sellerId) : null;

  const uploadedImages = [];
  if (r.images) {
    const imageUrls = r.images.split(',').map((img) => img.trim());
    for (let imgUrl of imageUrls) {
      const s3Url = await uploadImageFromUrl(imgUrl, sellerId);
      if (s3Url) uploadedImages.push(s3Url);
    }
  }

  const extra1 = r.extraimageurl1 ? await uploadImageFromUrl(r.extraimageurl1, sellerId) : null;
  const extra2 = r.extraimageurl2 ? await uploadImageFromUrl(r.extraimageurl2, sellerId) : null;
  const extra3 = r.extraimageurl3 ? await uploadImageFromUrl(r.extraimageurl3, sellerId) : null;

  return {
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode,
    name: r.name || 'Unnamed Product',
    description: r.description || null,
    brand: r.brand || null,
    ean: r.ean || null, // should be unique
    price,
    minPrice: r.minprice ? parseFloat(r.minprice) : null,
    maxPrice: r.maxprice ? parseFloat(r.maxprice) : null,
    msrp: r.msrp ? parseFloat(r.msrp) : null,
    purchasePrice: r.purchaseprice ? parseFloat(r.purchaseprice) : null,
    vatRateType: r.vatratetype ? r.vatratetype.toUpperCase() : 'STANDARD',
    shippingCost: r.shippingcost ? parseFloat(r.shippingcost) : 0,
    shippingTime: r.shippingtime || null,
    url: s3Url,
    isFrozen: r.isfrozen?.toLowerCase() === 'yes',
    categoryTrail: r.categorytrail || '',
    attributes: r.attributes,
    categories: [],
    marketPlace: r.marketplace,
    images: uploadedImages,
    currentStockCount: r.stock ? parseInt(r.stock, 10) || 0 : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    extraImageUrl1: extra1,
    extraImageUrl2: extra2,
    extraImageUrl3: extra3,
    size: r.size,
    color: r.color,
    volumetricWeightCm: r.volumetricweightcm,
    hsCodeAE: r.hscodeae,
    hsCodeSA: r.hscodesa,
    titleAr: r.titlear || '',
  };
};
