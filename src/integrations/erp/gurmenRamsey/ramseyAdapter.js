import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { ramseyConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { RAMSEY_XML_FEED_URL } = ramseyConfig;

export const createRamseyAdapter = () => {
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
      /**
       * TODO: Remove this limit once full import is ready for production.
       * This is just to avoid processing too many products during testing.
       */
      return productArray.slice(1, 11);
    },
  };
};
