import { parseXMLFeed } from '../../common/helpers/xmlParser.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { gurmanKipConfig } from './config/config.js';
import { fetchXml } from './utils/fetchXml.js';

const { KIP_XML_FEED_URL } = gurmanKipConfig;

export const createGurmanKipAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const xmlString = await fetchXml(KIP_XML_FEED_URL);
      if (!xmlString) throw new Error('Empty XML feed from Gürmen Group (KIP)');
      const parsed = await parseXMLFeed(xmlString);
      const products = parsed?.products?.product || [];
      const productArray = Array.isArray(products) ? products : [products];
      const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
      return productArray.reduce((acc, p) => {
        const subs = toArr(p?.subproducts?.subproduct);
        if (!subs.length) return acc.concat(p);
        const inStock = subs.filter((s) => Number(s.stock || 0) > 0);
        if (!inStock.length) return acc;
        acc.push({ ...p, subproducts: { ...p.subproducts, subproduct: inStock } });
        return acc;
      }, []);
    },
  };
};
