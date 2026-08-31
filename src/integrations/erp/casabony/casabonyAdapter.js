import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { casabonyConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';
const { CASABONY_XML_FEED_URL } = casabonyConfig;

export const createCasabonyAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(CASABONY_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Casabony');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.Root?.Urunler?.Urun || parsed?.Urunler?.Urun || [];
      const productArray = Array.isArray(products) ? products : [products];
      return productArray;
    },
  };
};
