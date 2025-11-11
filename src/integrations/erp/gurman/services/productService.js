import Product from '#root/src/models/Product.js';
import { parseXMLFeed } from '#root/src/integrations/common/helpers/xmlParser.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { gurmanConfig } from '../config/config.js';
import { formatGurmanProduct } from '../helpers/formatter.js';
import { fetchXml } from '../utils/fetchXml.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
const { GURMAN_XML_FEED_URL } = gurmanConfig;

export const getGurmanProducts = async (sellerId) => {
  try {
    const xmlString = await fetchXml(GURMAN_XML_FEED_URL);
    if (!xmlString) throw new Error('Empty XML feed from Gurman');
    const parsed = await parseXMLFeed(xmlString);
    const products = parsed.products.product || [];

    /**
     * TODO: Remove this limit once full import is ready for production.
     * This is just to avoid processing too many products during testing.
     */
    const limitedProducts = products.slice(1, 11);

    const categoryTrails = new Set();

    const formattedProducts = await formatGurmanProduct(limitedProducts, sellerId);

    const canonicalProducts = formattedProducts.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);
    for (const product of canonicalProducts) {
      if (product.categoryTrail) categoryTrails.add(product.categoryTrail);
    }
    if (canonicalProducts.length === 0) {
      console.log('No products to sync from Gurman.');
      return { message: 'No products to sync.' };
    }
    const bulkOps = canonicalProducts.map((product) => ({
      updateOne: {
        filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
        update: { $set: product },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps, { ordered: false });
    }
    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }
  } catch (error) {
    console.error(`Failed to Get gurman products :`, error);
    throw error;
  }
};
