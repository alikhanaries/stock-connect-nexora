import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { mapErpStyleImageFields } from '#helpers/productImageFields.js';
import { buildSentosPriceFields } from './formatPrice.js';
import { getWarehouseStock } from './stockHelper.js';
import { resolveCategoryTrail } from './categoryMapper.js';

const extractImageUrls = (images = []) => (Array.isArray(images) ? images : []).map((img) => img?.url).filter(Boolean);

const buildDescription = (item = {}) => {
  const raw = item.description_detail || item.description || '';
  return htmlToPlainText(raw);
};

const buildVariantRecord = async ({ sellerId, parentSku, variant, parentItem, categoryTrail }) => {
  const stock = getWarehouseStock(variant.stocks);
  if (stock <= 0) return null;

  const images = extractImageUrls(variant.images?.length ? variant.images : parentItem.images);
  const priceFields = await buildSentosPriceFields({
    ...parentItem,
    sale_price: variant.sale_price || parentItem.sale_price,
    purchase_price: variant.purchase_price || parentItem.purchase_price,
    prices: parentItem.prices,
  });

  return {
    sellerId,
    productSkuCode: variant.sku,
    parentProductSkuCode: parentSku,
    grandParentProductSkuCode: null,
    name: parentItem.name || variant.sku,
    description: buildDescription(parentItem),
    brand: parentItem.brand || '',
    color: variant.color || '',
    size: variant.model || '',
    ean: variant.barcode || parentItem.barcode || '',
    categoryTrail,
    currentStockCount: stock,
    productType: 'simple',
    status: 'active',
    source: 'SENTOS',
    vatRateType: Number(parentItem.vat_rate) > 0 ? 'STANDARD' : 'ZERO',
    volumetricWeightCm: parseSentosWeight(parentItem.volumetric_weight),
    hsCodeSA: variant.sku,
    hsCodeAE: variant.sku,
    ...mapErpStyleImageFields(images),
    ...priceFields,
  };
};

const parseSentosWeight = (value) => {
  const normalized = String(value || '0').replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.3;
};

const buildSimpleRecord = async ({ sellerId, item, categoryTrail }) => {
  const stock = getWarehouseStock(item.stocks);
  if (stock <= 0) return null;

  const images = extractImageUrls(item.images);
  const priceFields = await buildSentosPriceFields(item);

  return {
    sellerId,
    productSkuCode: item.sku,
    parentProductSkuCode: null,
    grandParentProductSkuCode: null,
    name: item.name || item.sku,
    description: buildDescription(item),
    brand: item.brand || '',
    color: '',
    size: '',
    ean: item.barcode || '',
    categoryTrail,
    currentStockCount: stock,
    productType: 'simple',
    status: 'active',
    source: 'SENTOS',
    vatRateType: Number(item.vat_rate) > 0 ? 'STANDARD' : 'ZERO',
    volumetricWeightCm: parseSentosWeight(item.volumetric_weight),
    hsCodeSA: item.sku,
    hsCodeAE: item.sku,
    ...mapErpStyleImageFields(images),
    ...priceFields,
  };
};

export const formatSentosProducts = async (items = [], sellerId, categoryMap = new Map()) => {
  const products = [];
  const parentsToDeactivate = [];

  for (const item of items) {
    const categoryTrail = resolveCategoryTrail(categoryMap, item.category_id);
    const variants = Array.isArray(item.variants) ? item.variants.filter((v) => v?.sku) : [];

    if (variants.length) {
      let importedCount = 0;

      for (const variant of variants) {
        const record = await buildVariantRecord({
          sellerId,
          parentSku: item.sku,
          variant,
          parentItem: item,
          categoryTrail,
        });

        if (record) {
          products.push(record);
          importedCount++;
        }
      }

      if (!importedCount) {
        parentsToDeactivate.push(item.sku);
      }

      continue;
    }

    const record = await buildSimpleRecord({ sellerId, item, categoryTrail });
    if (record) {
      products.push(record);
    } else if (item?.sku) {
      parentsToDeactivate.push(item.sku);
    }
  }

  return { products, parentsToDeactivate };
};
