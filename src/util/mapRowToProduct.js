import { normalizeImageUrl } from '../helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '../util/uploadImage.js';
import { generateS3Key } from '../util/generateS3Key.js';
import { getPublicImageUrl } from '../util/getPublicImageUrl.js';
import pLimit from 'p-limit';
import { cleanNumber } from '../helpers/Common.js';
const IMAGE_CONCURRENCY = 10;
const limit = pLimit(IMAGE_CONCURRENCY);
export const mapRowToProduct = async (row, index, locale, sellerId) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys
  const r = {};
  for (const [key, value] of Object.entries(row)) {
    r[key.toLowerCase().trim()] = value ? String(value).trim() : '';
  }

  // Required validations
  const errorData = [];
  if (!r.productskucode) errorData.push(locale.PRODUCT_SKUCODE_MISSING);
  if (!r.categorytrail) errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
  if (errorData.length) return { rowNumber: index, errorData };

  // Collect image URLs
  const allImageUrls = [r.primaryimageurl, r.imageurl, r.extraimageurl1, r.extraimageurl2, r.extraimageurl3]
    .filter(Boolean)
    .map(normalizeImageUrl);

  // Generate S3 keys
  const generatedKeys = allImageUrls.map((img) => generateS3Key(img, sellerId, r.productskucode));

  // Upload images async
  generatedKeys.forEach((key, i) => {
    limit(() => uploadImageFromUrl(allImageUrls[i], key)).catch((err) =>
      console.error(`Image upload failed (${allImageUrls[i]}): ${err.message}`)
    );
  });

  // Public URLs
  const publicUrls = generatedKeys.map(getPublicImageUrl);

  // Build product (ALL fields preserved)
  const product = {
    grandParentProductSkuCode: r.grandparentproductskucode || null,
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode,
    name: r.productname || 'Unnamed Product',
    nameAr: r.productnamear || '',
    description: r.description || null,
    descriptionAr: r.descriptionar || null,
    brand: r.brand || null,
    ean: r.ean || null,
    price: cleanNumber(r.price),
    minPrice: cleanNumber(r.minprice),
    maxPrice: cleanNumber(r.maxprice),
    msrp: cleanNumber(r.msrp),
    purchasePrice: cleanNumber(r.purchaseprice),
    vatRateType: r.vatratetype ? r.vatratetype.toUpperCase() : 'STANDARD',
    shippingCost: r.shippingcost ? parseFloat(r.shippingcost) : 0,
    shippingTime: r.shippingtime || null,
    primaryImageUrl: publicUrls[0] || null,
    imageUrl: publicUrls[1] || null,
    extraImageUrl1: publicUrls[2] || null,
    extraImageUrl2: publicUrls[3] || null,
    extraImageUrl3: publicUrls[4] || null,
    images: publicUrls.filter(Boolean),
    isFrozen: r.isfrozen?.toLowerCase() === 'yes',
    categoryTrail: r.categorytrail || '',
    attributes: r.attributes || null,
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
    longDescriptionAr: r.longdescriptionar || '',
    gender: r.gender,
    modelName: r.modelname || '',
    ageRangeDescription: r.agerangedescription,
    sizeType: r.sizetype,
    productCareInstructions: r.productcareinstructions || '',
    countryOfOrigin: r.countryoforigin || '',
    departmentName: r.departmentname || '',
    fabricType: r.fabrictype || '',
    style: r.style || '',
    weaveType: r.weavetype || '',
    dangerousGoodsRegulations: r.dangerousgoodsregulations || 'not_applicable',
    skinType: r.skintype || '',
    safetyWarning: r.safetywarning || '',
    unitCount: r.unitcount && parseFloat(r.unitcount),
    unitCountType: r.unitcounttype || '',
    targetAudienceKeyword: r.targetaudiencekeyword || '',
    hairType: r.hairtype || '',
    ingredientsList: r.ingredientslist || '',
    searchTerms: r.searchterms || '',
    scent: r.scent || '',
    numberOfItems: parseInt(r.numberofitems, 10) || 1,
    manufacturer: r.manufacturer || '',
    lifestyle: r.lifestyle || '',
    heatSensitive: r.heatsensitive?.toLowerCase() === 'yes',
    liquidContents: r.liquidcontents?.toLowerCase() === 'yes',
    itemForm: r.itemform || '',
    riseStyle: r.risestyle || '',
    intendedUse: r.intendeduse || '',
    productBenefit: r.productbenefit || '',
    itemLength: r.itemlength || '',
    itemWidth: r.itemwidth || '',
    itemHeight: r.itemheight || '',
    specialFeature: r.specialfeature || '',
    bulletPoint: r.bulletpoint || '',
    apparelSizeBodyType: r.apparelsizebodytype || '',
    specialSize: r.specialsize || '',
    material: r.material || '',
    closureType: r.closuretype || '',
    fitType: r.fittype || '',
    bottomsHeightType: r.bottomsheighttype || '',
  };

  // Remove empty / null values (1 fast loop)
  for (const key in product) {
    const v = product[key];
    if (v === '' || v === null || v === undefined) delete product[key];
  }
  return product;
};
