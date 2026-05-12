import Seller from '#root/src/models/Seller.js';

export const getShopifyConfig = async (sellerId) => {
  try {
    const sellerData = await Seller.findById(sellerId).select(
      '_id name shopifyConfig.url shopifyConfig.apiVersion +shopifyConfig.accessToken'
    );

    const dbConfig = sellerData?.shopifyConfig;

    if (!dbConfig?.url || !dbConfig?.apiVersion || !dbConfig?.accessToken) {
      return null;
    }

    return {
      url: dbConfig.url,
      apiVersion: dbConfig.apiVersion,
      accessToken: dbConfig.accessToken,
      sellerName: sellerData.name,
    };
  } catch (error) {
    console.error('getShopifyConfig error:', error);
    throw error;
  }
};
