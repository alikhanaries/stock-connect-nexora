// mapRowToProduct.js
import { uploadImageFromUrl } from '../util/uploadImage.js';
import pLimit from 'p-limit';
const IMAGE_CONCURRENCY = 10; // max 10 uploads at a time
const limit = pLimit(IMAGE_CONCURRENCY);
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

  // Collect all image URLs
  const allImageUrls = [
    r.url,
    ...(r.images ? r.images.split(',').map((img) => img.trim()) : []),
    r.extraimageurl1,
    r.extraimageurl2,
    r.extraimageurl3,
  ].filter(Boolean);
  // Upload all images with concurrency limit
  const uploadedUrls = await Promise.all(
    allImageUrls.map((imgUrl) =>
      limit(() =>
        uploadImageFromUrl(imgUrl, sellerId).catch((err) => {
          console.error(`Failed to upload ${imgUrl}: ${err.message}`);
          return null;
        })
      )
    )
  );
  // Map back results
  const [mainUrl, ...rest] = uploadedUrls;
  const [extra1, extra2, extra3] = rest.slice(-3);
  const uploadedImages = rest.slice(0, rest.length - 3).filter(Boolean);

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
    url: mainUrl || null,
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
