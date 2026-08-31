import { resolveDeliveryPostcode } from './saudiNationalAddress.js';

export const normalizePhone = (phone) => {
  // Strip non-digits and ensure 9-digit KSA style number starting with 5
  if (!phone) return 540000000;
  const digits = String(phone).replace(/\D/g, '');
  const last9 = digits.slice(-9);
  return last9.startsWith('5') ? Number(last9) : 540000000;
};

export const safeNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

// Build Delivery Payload

export const buildDeliveryPayload = (data = {}) => {
  const payload = {};
  const country = String(data.country || 'SA').toUpperCase();
  const shortCode = data.nationalAddressShortCode || null;

  payload.delivery_name = data.name || 'Customer';
  payload.delivery_email = data.email || '';
  payload.delivery_city = data.city || 'Riyadh';
  payload.delivery_address = data.address || data.city || 'Riyadh';
  payload.delivery_country = country;
  payload.delivery_postcode = resolveDeliveryPostcode(data.postcode, 11543);
  payload.delivery_phone = normalizePhone(data.phone);
  payload.delivery_neighbourhood = data.neighbourhood || data.city || 'Riyadh';
  payload.delivery_description = ''; // required by Aymakan schema

  if (country === 'SA' && shortCode) {
    payload.delivery_national_address = { short_code: shortCode };
  }

  return payload;
};

// Build Collection Payload

export const buildCollectionPayload = (data = {}) => {
  const payload = {};

  payload.collection_name = data.name || 'Warehouse';
  payload.collection_email = data.email || '';
  payload.collection_city = data.city || 'Riyadh';
  payload.collection_address = data.address || data.city || 'Riyadh';
  payload.collection_country = data.country || 'SA';
  payload.collection_postcode = safeNumber(data.postcode, 11543);
  payload.collection_phone = normalizePhone(data.phone);
  payload.collection_neighbourhood = data.neighbourhood || data.city || 'Riyadh';
  payload.collection_description = ''; // required by Aymakan schema

  return payload;
};
