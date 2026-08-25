export const formatSellerResponse = (seller) => {
  if (!seller) return seller;

  const { shopifyConfig, ...rest } = seller;

  return {
    ...rest,
    shopifyStoreUrl: shopifyConfig?.url,
    shopifyApiVersion: shopifyConfig?.apiVersion,
  };
};
