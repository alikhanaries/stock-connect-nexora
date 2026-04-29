import { filterInStockSubproducts } from '../../common/helpers/filterInStockSubproducts.js';
import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { xokidsConfig } from './config/config.js';
import { isBrandForSeller } from './helpers/brandMapping.js';
import { fetchXml } from './utils/fetchXml.js';

const { XOKIDS_XML_FEED_URL } = xokidsConfig;

export const createXokidsAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async (sellerSlug) => {
      if (!sellerSlug) throw new Error('sellerSlug is required to fetch Xokids products');
      const xmlString = await fetchXml(XOKIDS_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Xokids');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.products?.product || [];
      const productArray = Array.isArray(products) ? products : [products];
      const forSeller = productArray.filter((p) => isBrandForSeller(p?.brand, sellerSlug));
      return filterInStockSubproducts(forSeller);
    },
  };
};
