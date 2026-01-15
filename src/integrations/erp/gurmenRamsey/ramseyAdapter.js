import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { gurmanRamseyConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { RAMSEY_XML_FEED_URL } = gurmanRamseyConfig;

export const createGurmanRamseyAdapter = () => {
  const base = createBaseERPAdapter();
  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(RAMSEY_XML_FEED_URL);
      if (!xmlString) throw new Error('Ramsey (Gürmen Group) XML feed returned empty response');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.products?.product || [];
      if (!products) throw new Error('Invalid Ramsey (Gürmen Group) XML response structure');
      const productArray = Array.isArray(products) ? products : [products];
      return productArray;
    },
  };
};
