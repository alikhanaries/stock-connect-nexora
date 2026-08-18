import Shipment from '#root/src/models/Shipment/Shipment.js';
import { Buffer } from 'buffer';

const SHIPMENT_LOOKUP_METHODS = ['AYMAKAN', 'UNICOMMERCE', 'CHANNEL_ENGINE', 'MANUAL'];

export const parseOrderLineIds = (orderItemIds) => {
  const raw = Array.isArray(orderItemIds) ? orderItemIds : String(orderItemIds || '').split(',');
  return raw
    .map((id) => String(id).trim())
    .filter(Boolean)
    .map((id) => Number(id))
    .filter((id) => !Number.isNaN(id));
};

const findShipmentByOrderLineIds = async (sellerId, orderLineIds) => {
  if (!orderLineIds.length) return null;

  return Shipment.findOne({
    sellerId,
    shipmentMethod: { $in: SHIPMENT_LOOKUP_METHODS },
    'products.orderLineId': { $in: orderLineIds },
    status: { $nin: ['CANCELED'] },
  })
    .sort({ createdAt: -1 })
    .lean();
};

const resolveCourierFromShipment = (shipment) => {
  const shipping = shipment.extraData?.aymakan?.shipping;
  const trackingNumber =
    shipping?.tracking_number || shipment.airWaybillNo || shipment.trackingInfo?.[0]?.trackingNo || '';
  const courierCode =
    shipping?.courierCode ||
    shipment.method ||
    shipment.trackingInfo?.[0]?.carrier ||
    shipment.shipmentMerchantDetails?.name ||
    '';
  const courierName =
    shipping?.courierName ||
    shipment.method ||
    shipment.trackingInfo?.[0]?.carrier ||
    shipment.shipmentMerchantDetails?.name ||
    '';

  return { trackingNumber, courierCode, courierName };
};

const resolveLabelBase64 = async (shipment) => {
  const shipping = shipment.extraData?.aymakan?.shipping;
  const embeddedBase64 = shipping?.pdf_label_base64;

  if (embeddedBase64) {
    const commaIndex = embeddedBase64.indexOf(',');
    return commaIndex >= 0 ? embeddedBase64.slice(commaIndex + 1) : embeddedBase64;
  }

  const pdfLabelUrl = shipping?.pdf_label;
  if (!pdfLabelUrl) {
    return null;
  }

  const response = await fetch(pdfLabelUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch label: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
};

export const getCourierDetailsService = async (sellerId, orderItemIds) => {
  const ids = parseOrderLineIds(orderItemIds);
  const shipment = await findShipmentByOrderLineIds(sellerId, ids);

  if (!shipment) {
    return {
      awbNo: '',
      status: 'COURIER_NOT_ASSIGNED',
      courierCode: '',
      courierName: '',
      additionalInfo: 'No shipment found for the provided order item IDs',
    };
  }

  const { trackingNumber, courierCode, courierName } = resolveCourierFromShipment(shipment);

  if (trackingNumber && courierCode) {
    return {
      awbNo: trackingNumber,
      status: 'AVAILABLE',
      courierCode,
      courierName,
      additionalInfo: '',
    };
  }

  if (trackingNumber && (shipment.shipmentMethod === 'UNICOMMERCE' || shipment.shipmentMethod === 'MANUAL')) {
    return {
      awbNo: trackingNumber,
      status: 'SELLER_SHIPPING',
      courierCode: courierCode || '',
      courierName: courierName || shipment.method || '',
      additionalInfo: 'Self-shipped order',
    };
  }

  return {
    awbNo: trackingNumber || '',
    status: 'COURIER_NOT_ASSIGNED',
    courierCode,
    courierName,
    additionalInfo: 'Courier or tracking number not yet assigned',
  };
};

export const getLabelsService = async (sellerId, orderItemIds) => {
  const ids = parseOrderLineIds(orderItemIds);
  const shipment = await findShipmentByOrderLineIds(sellerId, ids);

  if (!shipment) {
    throw new Error('No shipment found for the provided order item IDs');
  }

  const base64Label = await resolveLabelBase64(shipment);
  if (!base64Label) {
    throw new Error('Label not available for this shipment');
  }

  return base64Label;
};
