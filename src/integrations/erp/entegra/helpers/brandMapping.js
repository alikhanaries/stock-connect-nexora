import { ENTEGRA_BRAND_MAP } from '../constants/common.js';

const normalize = (value) =>
  (value || '').toString().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '');

const BY_NORMALIZED_BRAND = new Map(ENTEGRA_BRAND_MAP.map((entry) => [normalize(entry.erpBrand), entry]));

const BY_SELLER_SLUG = new Map(ENTEGRA_BRAND_MAP.map((entry) => [entry.sellerSlug, entry]));

export const SUPPORTED_SELLER_SLUGS = ENTEGRA_BRAND_MAP.map((entry) => entry.sellerSlug);

export const getBrandMapping = (erpBrand) => BY_NORMALIZED_BRAND.get(normalize(erpBrand)) || null;

export const getMappingBySellerSlug = (sellerSlug) => BY_SELLER_SLUG.get(sellerSlug) || null;

export const isSupportedBrand = (erpBrand) => BY_NORMALIZED_BRAND.has(normalize(erpBrand));

export const isBrandForSeller = (erpBrand, sellerSlug) => {
  const mapping = getBrandMapping(erpBrand);
  return !!mapping && mapping.sellerSlug === sellerSlug;
};
