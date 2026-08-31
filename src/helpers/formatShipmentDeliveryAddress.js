import { extractSaudiNationalAddressShortCode } from './saudiNationalAddress.js';

export const formatShipmentDeliveryAddress = (orderShippingAddress, orderCustomer) => {
  try {
    if (!orderShippingAddress || !orderCustomer) {
      throw new Error('Missing address or customer data');
    }

    const { firstName, lastName, city, line1, line2, line3, zipCode, countryIso, houseNr, region } =
      orderShippingAddress;

    const { email, phone } = orderCustomer;
    const country = String(countryIso || '').toUpperCase();
    const nationalAddressShortCode =
      country === 'SA' ? extractSaudiNationalAddressShortCode(orderShippingAddress) : null;

    const hasZipOrSaShortCode = Boolean(zipCode) || (country === 'SA' && nationalAddressShortCode);

    if (!firstName || !lastName || !city || !line1 || !countryIso || !hasZipOrSaShortCode) {
      throw new Error('Incomplete shipping address data');
    }

    return {
      name: `${firstName} ${lastName}`.trim(),
      email: email || '',
      city: city || '',
      address: [line1, line2, line3].filter(Boolean).join(', '),
      postcode: zipCode || '',
      country: countryIso || '',
      phone: phone || '',
      description: '',
      houseNr: houseNr || '',
      region: region || '',
      nationalAddressShortCode: nationalAddressShortCode || undefined,
    };
  } catch (err) {
    console.error('Error in buildCollectionData:', err.message);
    return null; // So your calling code can handle it gracefully
  }
};
export const formatChannelEngineShipmentDeliveryAddress = (orderShippingAddress = {}, orderCustomer = {}) => {
  try {
    const {
      firstName = 'NA',
      lastName = 'NA',
      city = 'NA',
      line1 = 'NA',
      line2 = 'NA',
      line3 = 'NA',
      zipCode = 'NA',
      countryIso = 'NA',
    } = orderShippingAddress;

    const { email = 'NA', phone = 'NA' } = orderCustomer;

    return {
      name: `${firstName} ${lastName}`.trim() || 'NA',
      email,
      city,
      address: [line1, line2, line3].filter((v) => v && v !== 'NA').join(', ') || 'NA',
      postcode: zipCode,
      country: countryIso,
      phone,
      description: 'NA',
    };
  } catch (err) {
    console.error('Error in formatChannelEngineShipmentDeliveryAddress:', err);

    // Absolute fallback (in case something unexpected happens)
    return {
      name: 'NA',
      email: 'NA',
      city: 'NA',
      address: 'NA',
      postcode: 'NA',
      country: 'NA',
      phone: 'NA',
      description: 'NA',
    };
  }
};
