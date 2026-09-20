import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { SENTOS_CHANNEL_PRICE_MAP } from '../constants/common.js';
import { parseSentosPrice } from './parseSentosPrice.js';

const convertTryToSar = async (value) => {
  const parsed = parseSentosPrice(value);
  if (!parsed || parsed <= 0) return 0;
  return priceConverter('TRY', parsed);
};

const pickChannelPrice = (channelPrice = {}) => {
  const listPrice = parseSentosPrice(channelPrice.list_price);
  const salePrice = parseSentosPrice(channelPrice.sale_price);
  return listPrice > 0 ? listPrice : salePrice;
};

export const buildSentosPriceFields = async (item = {}) => {
  const baseTry = parseSentosPrice(item.sale_price) || parseSentosPrice(item.purchase_price);
  const purchaseTry = parseSentosPrice(item.purchase_price);

  const baseSar = await convertTryToSar(baseTry);
  const purchaseSar = purchaseTry > 0 ? await convertTryToSar(purchaseTry) : baseSar;

  const result = {
    price: baseSar,
    noonPrice: baseSar,
    namshiPrice: baseSar,
    amazonPrice: 0,
    purchasePrice: purchaseSar,
    msrp: baseSar,
    minPrice: null,
    maxPrice: baseSar,
  };

  const channelPrices = item.prices || {};

  for (const [channelKey, targetField] of Object.entries(SENTOS_CHANNEL_PRICE_MAP)) {
    const channelValue = pickChannelPrice(channelPrices[channelKey]);
    if (channelValue > 0) {
      result[targetField] = await convertTryToSar(channelValue);
    }
  }

  if (!result.amazonPrice && baseSar > 0) {
    result.amazonPrice = baseSar;
  }

  return result;
};

export const formatSentosPriceRows = async (items = [], sellerId) => {
  const products = [];

  for (const item of items) {
    const variants = Array.isArray(item.variants) ? item.variants : [];

    if (variants.length) {
      for (const variant of variants) {
        if (!variant?.sku) continue;
        const priceFields = await buildSentosPriceFields({
          ...item,
          sale_price: variant.sale_price || item.sale_price,
          purchase_price: variant.purchase_price || item.purchase_price,
          prices: item.prices,
        });

        products.push({
          sellerId,
          productSkuCode: variant.sku,
          ...priceFields,
        });
      }
      continue;
    }

    if (!item?.sku) continue;

    const priceFields = await buildSentosPriceFields(item);
    products.push({
      sellerId,
      productSkuCode: item.sku,
      ...priceFields,
    });
  }

  return { products };
};
