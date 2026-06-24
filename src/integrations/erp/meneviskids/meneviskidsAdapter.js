import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { meneviskidsConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { MENEVISKIDS_XML_FEED_URL } = meneviskidsConfig;

export const createMeneviskidsAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(MENEVISKIDS_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Menevis Kids');
      const parsed = await parseXMLFeed(xmlString);
      // Root tag is <Products> (capital P) with children <Product> (capital P)
      const products = parsed?.Products?.Product || [];
      return Array.isArray(products) ? products : [products];
    },
  };
};
