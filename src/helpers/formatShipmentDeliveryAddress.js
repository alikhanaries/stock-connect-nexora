export const formatShipmentDeliveryAddress = (orderShippingAddress, orderCustomer) => {
  try {
    if (!orderShippingAddress || !orderCustomer) {
      throw new Error('Missing address or customer data');
    }

    const { firstName, lastName, city, line1, line2, line3, zipCode, countryIso } = orderShippingAddress;

    const { email, phone } = orderCustomer;

    // Basic validation
    if (!firstName || !lastName || !city || !line1 || !zipCode || !countryIso) {
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
    };
  } catch (err) {
    console.error('Error in buildCollectionData:', err.message);
    return null; // So your calling code can handle it gracefully
  }
};
