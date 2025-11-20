import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { gurmanConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { GURMAN_XML_FEED_URL } = gurmanConfig;

export const createGurmanAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(GURMAN_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Gürmen Group (KIP)');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.products?.product || [];
      const productArray = Array.isArray(products) ? products : [products];
      /**
       * TODO: Remove this limit once full import is ready for production.
       * This is just to avoid processing too many products during testing.
       */
      return productArray.slice(1, 11);
    },
  };
};
