import Seller from '#models/Seller.js';
import { sentosConfig } from '../config/config.js';

export const getSentosSellerBySlug = async () => {
  return Seller.findOne({
    slug: sentosConfig.SENTOS_SELLER_SLUG,
    isDeleted: false,
    status: 'active',
  })
    .select('_id slug name')
    .lean();
};

export const isSentosSellerSlug = (slug) => slug === sentosConfig.SENTOS_SELLER_SLUG;
