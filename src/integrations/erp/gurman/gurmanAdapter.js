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
      if (!xmlString) throw new Error('Empty XML feed from Gurman');
      const productsData = await parseXMLFeed(xmlString);
      /**
       * TODO: Remove this limit once full import is ready for production.
       * This is just to avoid processing too many products during testing.
       */
      let products = productsData.products.product;
      const limitedProducts = products.slice(1, 11);
      return limitedProducts;
    },
  };
};
