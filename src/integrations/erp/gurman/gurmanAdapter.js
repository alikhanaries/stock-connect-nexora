import { parseXMLFeed } from '../../common/helpers/parser.js';
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
      const products = await parseXMLFeed(xmlString);
      return products.products.product;
    },
  };
};
