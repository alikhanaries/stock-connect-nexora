const { OMNIFUL_API_URL, CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { config } from '../config/config.js';

export const createShipmentwithCE = async (shipmentData) => {
  const omnifulAccessToken = await getReportToken();
  if (!omnifulAccessToken) {
    throw new Error('Access token not available');
  }
  const orderId = shipmentData._id.toString();
  const getOrderResponse = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/orders/${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${omnifulAccessToken}`,
    },
  });

  const getOrderResponseData = await getOrderResponse.json();
  const CEPayload = {
    MerchantShipmentNo: shipmentData.merchantShipmentNo,
    MerchantOrderNo: shipmentData.merchantOrderNo,
    Lines: shipmentData.products.map((product) => ({
      MerchantProductNo: product.merchantProductNo,
      OrderLineId: product.orderLineId,
      Quantity: product.quantity,
    })),
    TrackTraceNo: getOrderResponseData?.data?.shipment?.awb_number || '',
    ReturnTrackTraceNo: '',
    Method: '',
    ShippedFromCountryCode: getOrderResponseData?.data?.billing_address?.country,
    ShipmentDate: getOrderResponseData?.data?.order_created_at,
    ReturnMethod: '',
    IsMerchantCreator: true,
    AirWaybillNo: shipmentData.airWaybillNo,
  };

  const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`;
  await fetch(ceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CEPayload),
  });
};

export default {
  createShipmentwithCE,
};
