import { AMAZON_CHANNEL_NAME } from '#constants/common.js';

export { AMAZON_CHANNEL_NAME };

/**
 * Returns true when the CE order belongs to Amazon.sa marketplace.
 * @param {{ channelName?: string } | null | undefined} order
 */
export const isAmazonChannelOrder = (order) => order?.channelName === AMAZON_CHANNEL_NAME;

/**
 * Riyadh warehouse delivery address used for Noon/Namshi Aymakan → Widect handoff.
 */
export const getAymakanWarehouseDeliveryAddress = (appConfig) => ({
  name: appConfig.AYMAKAN_DELIVERY_NAME,
  email: appConfig.AYMAKAN_DELIVERY_EMAIL,
  city: appConfig.AYMAKAN_DELIVERY_CITY,
  address: appConfig.AYMAKAN_DELIVERY_ADDRESS,
  country: appConfig.AYMAKAN_DELIVERY_COUNTRY,
  phone: appConfig.AYMAKAN_DELIVERY_PHONE,
  postcode: appConfig.AYMAKAN_DELIVERY_POSTCODE,
  short_code: appConfig.AYMAKAN_DELIVERY_SHORT_CODE,
  lat: appConfig.AYMAKAN_DELIVERY_LAT,
  long: appConfig.AYMAKAN_DELIVERY_LONG,
});
