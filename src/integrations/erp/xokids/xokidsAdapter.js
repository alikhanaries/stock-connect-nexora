import { filterInStockSubproducts } from '../../common/helpers/filterInStockSubproducts.js';
import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { xokidsConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { XOKIDS_XML_FEED_URL } = xokidsConfig;

export const createXokidsAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(XOKIDS_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Xokids');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.products?.product || [];
      const productArray = Array.isArray(products) ? products : [products];
      const xokidsOnly = productArray.filter((p) => {
        const brand = (p?.brand || '').toString().trim().toLowerCase().replace(/\s+/g, '');
        return brand === 'xokids';
      });
      return filterInStockSubproducts(xokidsOnly);
    },
  };
};
