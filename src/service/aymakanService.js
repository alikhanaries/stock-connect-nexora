import { config } from '../config/config.js';
const { AYMAKAN_API_KEY, AYMAKAN_API_URL } = config;

export const createAymakanShipment = async (payload) => {
  try {
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
        statusLabel: null,
        createdAt: null,
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: null,
        pickup_date: null,
        delivery_date: null,
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
      console.warn(`Aymakan API request failed for ${trackingNumber} with status ${response.status}`);
      return {
        status: 'UNKNOWN',
        statusLabel: null,
        createdAt: null,
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: null,
        pickup_date: null,
        delivery_date: null,
      };
    }

    const aymakanResult = await response.json();

    if (!aymakanResult.success || !aymakanResult.data?.shipments?.length) {
      console.warn(`Aymakan Tracking Failed for ${trackingNumber}: ${aymakanResult.message || 'No shipment data'}`);
      return {
        status: 'UNKNOWN',
        statusLabel: null,
        createdAt: null,
        idCustomer: 2,
        isReversePickup: 0,
        trackingInfo: [],
        collection_country: null,
        pickup_date: null,
        delivery_date: null,
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
      statusLabel: null,
      createdAt: null,
      idCustomer: 2,
      isReversePickup: 0,
      trackingInfo: [],
      collection_country: null,
      pickup_date: null,
      delivery_date: null,
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
