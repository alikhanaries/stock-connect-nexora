import { config } from '../config/config.js';
const { AYMAKAN_API_KEY, AYMAKAN_API_URL } = config;

export const createAymakanShipmentAPI = async (payload) => {
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

    // 6️⃣ Parse JSON body
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

export const trackAymakanShipmentAPI = async (trackingNumber) => {
  if (!trackingNumber) {
    throw new Error('Tracking number is required for Aymakan API');
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
    const errorData = await response.json();
    throw new Error(errorData?.message);
  }

  const aymakanResult = await response.json();

  if (!aymakanResult.success) {
    throw new Error(`Aymakan Tracking Failed: ${aymakanResult.message}`);
  }

  const shipment = aymakanResult.data.shipments[0]; // take the first shipment

  if (!shipment) {
    throw new Error('No shipment data found for this tracking number.');
  }

  // Return only the required fields as a single object
  return {
    status: shipment.status,
    statusLabel: shipment.status_label,
    createdAt: shipment.created_at,
    idCustomer: 2, // static value
    isReversePickup: 0, // static value
    trackingInfo: shipment.tracking_info,
  };
};

export const getAymakanShipmentCitiesAPI = async () => {
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

    // 6️⃣ Parse JSON body
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
