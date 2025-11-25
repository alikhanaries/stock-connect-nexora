import { normalizeImageUrl } from '../helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '../util/uploadImage.js';
import { generateS3Key } from '../util/generateS3Key.js';
import { getPublicImageUrl } from '../util/getPublicImageUrl.js';
import pLimit from 'p-limit';
const IMAGE_CONCURRENCY = 10;
const limit = pLimit(IMAGE_CONCURRENCY);
export const mapRowToProduct = async (row, index, locale, sellerId) => {
  if (!row || typeof row !== 'object') return null;

  const r = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value ? String(value).trim() : ''])
  );

  const errorData = [];
  if (!r.productskucode) errorData.push(locale.PRODUCT_SKUCODE_MISSING);
  if (!r.categorytrail) errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
  if (errorData.length) {
    return { rowNumber: index, errorData };
  }

  const allImageUrls = [r.primaryimageurl, r.imageurl, r.extraimageurl1, r.extraimageurl2, r.extraimageurl3]
    .filter(Boolean)
    .map((url) => normalizeImageUrl(url));

  // Generate S3 keys
  const generatedKeys = allImageUrls.map((img) => generateS3Key(img, sellerId, r.productskucode));

  // Async upload (fire & forget)
  generatedKeys.forEach((key, i) => {
    limit(() => uploadImageFromUrl(allImageUrls[i], key)).catch((err) => {
      console.error(`Image upload failed async (${allImageUrls[i]}): ${err.message}`);
    });
  });

  const [primaryKey, imageKey, extraKey1, extraKey2, extraKey3] = generatedKeys;

  const primaryImageUrl = getPublicImageUrl(primaryKey);
  const imageUrl = getPublicImageUrl(imageKey);
  const extraImageUrl1 = getPublicImageUrl(extraKey1);
  const extraImageUrl2 = getPublicImageUrl(extraKey2);
  const extraImageUrl3 = getPublicImageUrl(extraKey3);
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
    price: r.price ? parseFloat(r.price) : null,
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
    titleAr: r.titlear || '',
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
    unitCount: r.unitcount ? parseFloat(r.unitcount) : '',
    unitCountType: r.unitcounttype || '',
    targetAudienceKeyword: r.targetaudiencekeyword || '',
    hairType: r.hairtype || '',
    ingredientsList: r.ingredientslist || '',
    searchTerms: r.searchterms || '',
    scent: r.scent || '',
    numberOfItems: r.numberofitems ? parseInt(r.numberofitems, 10) || 1 : 1,
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

  Object.keys(product).forEach((key) => {
    const val = product[key];
    if (val === null || val === '' || val === undefined) {
      delete product[key];
    }
  });
  return product;
};
