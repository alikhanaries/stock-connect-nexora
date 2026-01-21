import { config } from '../config/config.js';
const { AYMAKAN_API_KEY, AYMAKAN_API_URL } = config;

export const createAymakanShipment = async (payload) => {
  try {
    payload.fulfilment_customer_name = payload.delivery_name; // <-- ADD THIS
    // Call Aymakan API
    const response = await fetch(`${AYMAKAN_API_URL}shipping/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    }

    //  Parse JSON body
    const result = await response.json().catch(async () => {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    });

    // Validate response
    if (!result?.shipping?.tracking_number) {
      throw new Error('Invalid response from Aymakan API: Missing tracking number');
    }

    return result;
  } catch (error) {
    console.error('Aymakan Service Error:', error.message, error.stack);
    throw error;
  }
};

export const trackAymakanShipment = async (trackingNumber) => {
  try {
    if (!trackingNumber) {
      return {
        status: 'UNKNOWN',
        statusLabel: '',
        createdAt: '',
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: '',
        pickup_date: '',
        delivery_date: '',
      };
    }

    const url = `${AYMAKAN_API_URL}shipping/track/${trackingNumber}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY,
      },
    });

    if (!response.ok) {
      return {
        status: 'UNKNOWN',
        statusLabel: '',
        createdAt: '',
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: '',
        pickup_date: '',
        delivery_date: '',
      };
    }

    const aymakanResult = await response.json();

    if (!aymakanResult.success || !aymakanResult.data?.shipments?.length) {
      return {
        status: 'UNKNOWN',
        statusLabel: '',
        createdAt: '',
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: '',
        pickup_date: '',
        delivery_date: '',
      };
    }

    const shipment = aymakanResult.data.shipments[0];

    return {
      status: shipment.status || 'UNKNOWN',
      statusLabel: shipment.status_label || null,
      createdAt: shipment.created_at || null,
      idCustomer: 2,
      isReversePickup: 0,
      trackingInfo: Array.isArray(shipment.tracking_info) ? shipment.tracking_info : [],
      collection_country: shipment.collection_country || null,
      pickup_date: shipment.pickup_date || null,
      delivery_date: shipment.delivery_date || null,
    };
  } catch (err) {
    console.error(`Silent error tracking Aymakan shipment for ${trackingNumber}:`, err.message);
    return {
      status: 'UNKNOWN',
      statusLabel: '',
      createdAt: '',
      idCustomer: 2,
      isReversePickup: 0,
      trackingInfo: [],
      collection_country: '',
      pickup_date: '',
      delivery_date: '',
    };
  }
};

export const getAymakanShipmentCities = async () => {
  try {
    // Call Aymakan API
    const response = await fetch(`${AYMAKAN_API_URL}cities`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    }

    // 6️ Parse JSON body
    const result = await response.json().catch(async () => {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    });

    return result;
  } catch (error) {
    console.error('Aymakan Service Error:', error.message, error.stack);
    throw error;
  }
};

export const cancelAymakanShipment = async (trackingNumber) => {
  try {
    if (!trackingNumber) {
      throw new Error('Tracking number is required for Aymakan API');
    }

    const payload = { tracking: trackingNumber };

    const response = await fetch(`${AYMAKAN_API_URL}shipping/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY, // or `Bearer ${AYMAKAN_API_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || 'Failed to cancel shipment with Aymakan API');
    }

    const aymakanResult = await response.json();

    if (!aymakanResult.success) {
      throw new Error(`Aymakan Cancel Failed: ${aymakanResult.message || 'Unknown error'}`);
    }

    return aymakanResult;
  } catch (error) {
    console.error('Error cancelling Aymakan shipment:', error.message);
    throw new Error(error.message || 'Unexpected error occurred while cancelling Aymakan shipment');
  }
};

export const createAymakanReverseShipment = async (payload) => {
  try {
    // Call Aymakan API
    const response = await fetch(`${AYMAKAN_API_URL}shipping/create/reverse_pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    }

    //  Parse JSON body
    const result = await response.json().catch(async () => {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    });

    // Validate response
    if (!result?.shipping?.tracking_number) {
      throw new Error('Invalid response from Aymakan API: Missing tracking number');
    }

    return result;
  } catch (error) {
    console.log(error);
    console.error('Aymakan Service Error:', error.message, error.stack);
    throw error;
  }
};
