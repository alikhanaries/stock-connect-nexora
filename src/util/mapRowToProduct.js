import { normalizeImageUrl } from '../helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '../util/uploadImage.js';
import pLimit from 'p-limit';
const IMAGE_CONCURRENCY = 10;
const limit = pLimit(IMAGE_CONCURRENCY);
export const mapRowToProduct = async (row, index, locale, sellerId) => {
  if (!row || typeof row !== 'object') return null;

  const r = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value ? String(value).trim() : ''])
  );

  const price = parseFloat(r.price);
  const errorData = [];
  if (!r.productskucode) errorData.push(locale.PRODUCT_SKUCODE_MISSING);
  if (isNaN(price)) errorData.push(locale.PRODUCT_PRICE_MISSING);
  if (!r.categorytrail) errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
  if (errorData.length) {
    return { rowNumber: index, errorData };
  }

  const allImageUrls = [r.primaryimageurl, r.imageurl, r.extraimageurl1, r.extraimageurl2, r.extraimageurl3]
    .filter(Boolean)
    .map((url) => normalizeImageUrl(url.trim()));
  const uploadedUrls = await Promise.all(
    allImageUrls.map((imgUrl) =>
      limit(async () => {
        try {
          return await uploadImageFromUrl(imgUrl, sellerId);
        } catch (err) {
          console.error(`Failed to upload image [${imgUrl}]: ${err.message}`);
          return null;
        }
      })
    )
  );

  const validUploadedUrls = uploadedUrls.filter(Boolean);
  const [primaryImageUrl, imageUrl, extraImageUrl1, extraImageUrl2, extraImageUrl3] = validUploadedUrls;

  return {
    grandParentProductSkuCode: r.grandparentproductskucode || null,
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode,
    name: r.productname || 'Unnamed Product',
    nameAr: r.productnamear || '',
    description: r.description || null,
    descriptionAr: r.descriptionar || null,
    brand: r.brand || null,
    ean: r.ean || null,
    price,
    minPrice: r.minprice ? parseFloat(r.minprice) : null,
    maxPrice: r.maxprice ? parseFloat(r.maxprice) : null,
    msrp: r.msrp ? parseFloat(r.msrp) : null,
    purchasePrice: r.purchaseprice ? parseFloat(r.purchaseprice) : null,
    vatRateType: r.vatratetype ? r.vatratetype.toUpperCase() : 'STANDARD',
    shippingCost: r.shippingcost ? parseFloat(r.shippingcost) : 0,
    shippingTime: r.shippingtime || null,
    primaryImageUrl: primaryImageUrl || null,
    imageUrl: imageUrl || null,
    extraImageUrl1: extraImageUrl1 || null,
    extraImageUrl2: extraImageUrl2 || null,
    extraImageUrl3: extraImageUrl3 || null,
    images: validUploadedUrls,
    isFrozen: r.isfrozen?.toLowerCase() === 'yes',
    categoryTrail: r.categorytrail || '',
    attributes: r.attributes || null,
    categories: [],
    marketPlace: r.marketplace || null,
    currentStockCount: r.stock ? parseInt(r.stock, 10) || 0 : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    size: r.size || null,
    color: r.color || null,
    volumetricWeightCm: r.volumetricweightcm ? parseFloat(r.volumetricweightcm) : null,
    hsCodeAE: r.hscodeae || null,
    hsCodeSA: r.hscodesa || null,
  };
};
