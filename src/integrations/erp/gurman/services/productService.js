import { parseXMLFeed } from '#root/src/integrations/common/helpers/xmlParser.js';
import { gurmanConfig } from '../config/config.js';
import { formatGurmanProduct } from '../helpers/formatter.js';
import { fetchXml } from '../utils/fetchXml.js';

const { GURMAN_XML_FEED_URL } = gurmanConfig;

export const getGurmanProducts = async (sellerId) => {
  try {
    const xmlString = await fetchXml(GURMAN_XML_FEED_URL);
    if (!xmlString) throw new Error('Empty XML feed from Gurman');
    const parsed = await parseXMLFeed(xmlString);
    const products = parsed.products.product || [];
    const canonicalProducts = products.map((p) => formatGurmanProduct(p, sellerId));

    /**
     * TODO [DB WRITE - FRONTEND INTEGRATION PENDING]:
     * Once frontend integration is complete, add code here to persist
     * canonicalProducts to the database (e.g., Product.bulkWrite or equivalent).
     * For now, products are prepared but not stored.
     */

    return canonicalProducts;
  } catch (error) {
    console.error(`Failed to Get gurman products :`, error);
    throw error;
  }
};
