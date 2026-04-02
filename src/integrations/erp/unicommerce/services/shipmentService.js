import Shipment from '#root/src/models/Shipment/Shipment.js';
import { Buffer } from 'buffer';

const parseOrderItemIds = (orderItemIds) =>
  orderItemIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const findShipmentByLineIds = (sellerId, ids) =>
  Shipment.findOne({
    sellerId,
    'products.orderLineId': { $in: ids },
    status: { $nin: ['CANCELED'] },
  })
    .sort({ createdAt: -1 })
    .lean();

export const getCourierDetailsService = async (sellerId, orderItemIds) => {
  const ids = parseOrderItemIds(orderItemIds);
  const shipment = await findShipmentByLineIds(sellerId, ids);

  if (!shipment) {
    return {
      awbNo: '',
      status: 'COURIER_NOT_ASSIGNED',
      courierCode: '',
      courierName: '',
    };
  }

  const hasAwb = Boolean(shipment.airWaybillNo);
  const hasCourier = Boolean(shipment.method);

  let status;
  if (hasAwb && hasCourier) {
    status = 'AVAILABLE';
  } else if (shipment.isMerchantCreator) {
    status = 'SELLER_SHIPPING';
  } else {
    status = 'COURIER_NOT_ASSIGNED';
  }

  return {
    awbNo: shipment.airWaybillNo || '',
    status,
    courierCode: shipment.method || '',
    courierName: shipment.method || '',
    ...(shipment.description && { additionalInfo: shipment.description }),
  };
};

export const getLabelsService = async (sellerId, orderItemIds) => {
  const ids = parseOrderItemIds(orderItemIds);
  const shipment = await Shipment.findOne({
    sellerId,
    'products.orderLineId': { $in: ids },
    status: { $nin: ['CANCELED'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!shipment) {
    throw new Error('No shipment found for the provided order item IDs');
  }

  const pdfLabelUrl = shipment.extraData?.aymakan?.shipping?.pdf_label;
  if (!pdfLabelUrl) {
    throw new Error('Label URL not available for this shipment');
  }

  const response = await fetch(pdfLabelUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch label: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
};
