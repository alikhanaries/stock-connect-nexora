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
