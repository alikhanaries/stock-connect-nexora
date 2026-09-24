import { normalizeImageUrl } from '../helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '../util/uploadImage.js';
import { generateS3Key } from '../util/generateS3Key.js';
import { getPublicImageUrl } from '../util/getPublicImageUrl.js';
import pLimit from 'p-limit';
import { cleanNumber } from '../helpers/Common.js';
import {
  collectCsvImageSlotsFromRow,
  mapCsvStyleImageFields,
  collectCsvAmazonImageSlotsFromRow,
  mapCsvStyleAmazonImageFields,
} from '../helpers/productImageFields.js';
const IMAGE_CONCURRENCY = 10;
const limit = pLimit(IMAGE_CONCURRENCY);
export const mapRowToProduct = async (row, index, locale, sellerId, isImageUpdate = false, isNewSku = false, brand) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys (lowercase, trim, remove spaces — handles "Amazon Price" / "amazonPrice")
  const r = {};
  for (const [key, value] of Object.entries(row)) {
    r[key.toLowerCase().trim().replace(/\s+/g, '')] = value ? String(value).trim() : '';
  }

  // Required validations
  const errorData = [];
  if (!r.productskucode) errorData.push(locale.PRODUCT_SKUCODE_MISSING);
  if ((parseInt(r.stock, 10) || 0) <= 0) errorData.push('Product skipped due to zero stock');
  if (isNewSku) {
    if (!r.categorytrail) errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
    if (!r.primaryimageurl) errorData.push('Primary image url is missing');
  }

  if (errorData.length) return { rowNumber: index, errorData };

  let imageFields = null;
  let amazonImageFields = null;

  //  IMAGE HANDLING ONLY WHEN isImageUpdate === TRUE AND NEW SKU COME
  const shouldUploadImages = isNewSku || isImageUpdate === true;
  if (shouldUploadImages) {
    // Fixed-length slots so empty middle CSV columns keep exact positions
    const imageSlots = collectCsvImageSlotsFromRow(r).map((url) => (url ? normalizeImageUrl(url) : ''));

    const publicSlots = imageSlots.map((url) => {
      if (!url) return '';
      const key = generateS3Key(url, sellerId, r.productskucode);
      limit(() => uploadImageFromUrl(url, key)).catch((err) =>
        console.error(`Image upload failed (${url}): ${err.message}`)
      );
      return getPublicImageUrl(key);
    });

    if (publicSlots.some(Boolean)) {
      imageFields = mapCsvStyleImageFields(publicSlots);
    }

    // Handle Amazon Image slots
    const amazonImageSlots = collectCsvAmazonImageSlotsFromRow(r).map((url) => (url ? normalizeImageUrl(url) : ''));
    if (amazonImageSlots.some(Boolean)) {
      const amazonPublicSlots = amazonImageSlots.map((url) => {
        if (!url) return '';
        const key = generateS3Key(url, sellerId, `amazon-${r.productskucode}`);
        limit(() => uploadImageFromUrl(url, key)).catch((err) =>
          console.error(`Amazon image upload failed (${url}): ${err.message}`)
        );
        return getPublicImageUrl(key);
      });

      if (amazonPublicSlots.some(Boolean)) {
        amazonImageFields = mapCsvStyleAmazonImageFields(amazonPublicSlots);
      }
    }
  }

  // Build product (ALL fields preserved)
  const product = {
    rowNumber: index,
    grandParentProductSkuCode: r.grandparentproductskucode || null,
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode,
    name: r.productname || '',
    nameAr: r.productnamear || '',
    description: r.description || null,
    descriptionAr: r.descriptionar || null,
    brand: brand,
    ean: r.ean || null,
    price: cleanNumber(r.price),
    noonPrice: cleanNumber(r.noonprice),
    namshiPrice: cleanNumber(r.namshiprice),
    amazonPrice: cleanNumber(r.amazonprice),
    minPrice: cleanNumber(r.minprice) || null,
    maxPrice: cleanNumber(r.maxprice) || null,
    msrp: cleanNumber(r.msrp),
    purchasePrice: cleanNumber(r.purchaseprice),
    vatRateType: r.vatratetype ? r.vatratetype.toUpperCase() : 'STANDARD',
    shippingCost: r.shippingcost ? parseFloat(r.shippingcost) : null,
    shippingTime: r.shippingtime || null,
    ...(imageFields || {}),
    ...(amazonImageFields || {}),
    isFrozen: r.isfrozen?.toLowerCase() === 'yes',
    categoryTrail: r.categorytrail || '',
    categories: [],
    marketPlace: r.marketplace || null,
    currentStockCount: parseInt(r.stock, 10) || 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    size: r.size || null,
    color: r.color || null,
    volumetricWeightCm: r.volumetricweightcm && parseFloat(r.volumetricweightcm),
    hsCodeAE: r.hscodeae || null,
    hsCodeSA: r.hscodesa || null,
    gender: r.gender || '',
    ageRangeDescription: r.agerangedescription || '',
    countryOfOrigin: r.countryoforigin || '',
  };
  // Amazon-specific listing attributes only set keys that have a value
  const amazonFieldMap = {
    variationThemeName: r.variationthemename,
    modelNumber: r.modelnumber,
    modelName: r.modelname,
    style: r.style,
    bulletPoint: r.bulletpoint,
    footwearSizeSystem: r.footwearsizesystem,
    footwearAgeGroup: r.footwearagegroup,
    footwearSizeClass: r.footwearsizeclass,
    footwearWidth: r.footwearwidth,
    footwearSize: r.footwearsize,
    soleMaterial: r.solematerial,
    toeStyle: r.toestyle,
    heightMap: r.heightmap,
    heelType: r.heeltype,
    waterResistanceLevel: r.waterresistancelevel,
    closure: r.closure,
    shaftCircumference: r.shaftcircumference,
    shaftHeight: r.shaftheight,
    skipOffer: r.skipoffer,
    itemCondition: r.itemcondition,
    listPriceCurrency: r.listpricecurrency,
    dangerousGoodsRegulations: r.dangerousgoodsregulations,
    outerMaterial: r.outermaterial,
    departmentName: r.departmentname,
    sizeSystem: r.sizesystem,
    sizeClass: r.sizeclass,
    bodyType: r.bodytype,
    heightType: r.heighttype,
    fabricType: r.fabrictype,
    specialSize: r.specialsize,
    weaveType: r.weavetype,
    careInstructions: r.careinstructions,
    shippingTemplateSA: r.shippingtemplatesa,
    fitType: r.fittype,
    riseStyle: r.risestyle,
    closureType: r.closuretype,
    occasion: r.occasion,
    subtype: r.subtype,
    sleeveType: r.sleevetype,
    neck: r.neck,
    material: r.material,
    pattern: r.pattern,
  };
  const amazon = {
    ...Object.fromEntries(Object.entries(amazonFieldMap).filter(([, v]) => v)),
    ...(amazonImageFields || {}),
  };
  if (Object.keys(amazon).length) product.amazon = amazon;

  return Object.fromEntries(Object.entries(product).filter(([, v]) => v !== '' && v !== null && v !== undefined));
};
