import Shipment from '#root/src/models/Shipment/Shipment.js';
import { Buffer } from 'buffer';

export const getLabelsService = async (sellerId, orderItemIds) => {
  const ids = orderItemIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

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
