import Shipment from '#root/src/models/Shipment/Shipment.js';
import Order from '#root/src/models/Orders.js';
import PickupAddress from '#root/src/models/PickUpAddress.js';
import { Buffer } from 'buffer';
import { resolveEffectiveShipmentAwb } from '#helpers/shipmentAwb.js';
import { createFullShipmentService } from '#root/src/service/shipmentService.js';

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
    resolveEffectiveShipmentAwb(shipment) || shipping?.tracking_number || shipment.trackingInfo?.[0]?.trackingNo || '';
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

const aggregateOrderItemQuantities = (orderItems) => {
  const byLineId = new Map();

  for (const item of orderItems) {
    const lineId = String(item.orderItemId);
    const existing = byLineId.get(lineId);

    if (existing) {
      existing.quantity += 1;
    } else {
      byLineId.set(lineId, { ...item, orderItemId: lineId, quantity: 1 });
    }
  }

  return byLineId;
};

const buildOrderItemTaxMap = (orderItems) => {
  const taxByLineId = {};

  for (const item of orderItems) {
    const lineId = String(item.orderItemId);

    if (taxByLineId[lineId]) continue;

    taxByLineId[lineId] = {
      invoiceNumber: item.invoiceNumber ?? null,
      invoiceDate: item.invoiceDate ?? null,
      taxRate: item.taxRate ?? null,
      centralGstPercentage: item.centralGstPercentage ?? null,
      compensationCessPercentage: item.compensationCessPercentage ?? null,
      integratedGstPercentage: item.integratedGstPercentage ?? null,
      stateGstPercentage: item.stateGstPercentage ?? null,
      unionTerritoryGstPercentage: item.unionTerritoryGstPercentage ?? null,
    };
  }

  return taxByLineId;
};

const resolveSellerPickUpId = async (sellerId) => {
  const pickup = await PickupAddress.findOne({ sellerId, status: 'active' })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();

  return pickup?._id?.toString() || null;
};

const buildProductsFromOrder = (order, qtyByLineId) => {
  const skuById = new Map((order.orderSkuList?.skuList || []).map((sku) => [String(sku.id), sku]));
  const products = [];

  for (const [lineId, entry] of qtyByLineId) {
    const sku = skuById.get(lineId);
    if (!sku) continue;

    products.push({
      merchantProductNo: sku.merchantProductNo,
      orderLineId: sku.id,
      quantity: entry.quantity,
      originalLineTotalInclVat: sku.lineTotalInclVat || 0,
      hsCode: sku.hsCode || '1111111',
    });
  }

  return products;
};

const buildShipmentDetailsUpdate = ({ boxHeight, boxLength, boxWidth, weight }, orderItems, taxByLineId) => {
  const firstWithInvoice = orderItems.find((item) => item.invoiceNumber);

  return {
    'extraData.shipmentDetails.height': boxHeight ?? null,
    'extraData.shipmentDetails.length': boxLength ?? null,
    'extraData.shipmentDetails.width': boxWidth ?? null,
    'extraData.shipmentDetails.weight': weight ?? null,
    'extraData.shipmentDetails.invoice_number': firstWithInvoice?.invoiceNumber ?? null,
    'extraData.shipmentDetails.invoice_date': firstWithInvoice?.invoiceDate ?? null,
    'extraData.aymakan.unicommerceOrderItemTax': taxByLineId,
  };
};

const applyShipmentDetailsUpdate = async (shipmentId, payload, orderItems, taxByLineId) => {
  await Shipment.updateOne({ _id: shipmentId }, { $set: buildShipmentDetailsUpdate(payload, orderItems, taxByLineId) });
};

const resolveOrdersForLineIds = async (sellerId, qtyByLineId) => {
  const resolved = new Map();

  for (const [lineId] of qtyByLineId) {
    const numericLineId = Number(lineId);
    if (Number.isNaN(numericLineId)) {
      resolved.set(lineId, { errorMessage: 'Invalid orderItemId' });
      continue;
    }

    const order = await Order.findOne({
      $or: [{ sellerId }, { sellerIds: sellerId }],
      'orderSkuList.skuList.id': numericLineId,
    }).lean();

    if (!order) {
      resolved.set(lineId, { errorMessage: 'Order item not found' });
      continue;
    }

    const sku = (order.orderSkuList?.skuList || []).find((item) => String(item.id) === lineId);
    if (!sku) {
      resolved.set(lineId, { errorMessage: 'Order item not found' });
      continue;
    }

    resolved.set(lineId, { order, sku });
  }

  return resolved;
};

const groupLineIdsByOrder = (qtyByLineId, resolved) => {
  const groups = new Map();

  for (const [lineId, entry] of qtyByLineId) {
    const resolution = resolved.get(lineId);
    if (!resolution?.order) continue;

    const orderKey = String(resolution.order._id);
    if (!groups.has(orderKey)) {
      groups.set(orderKey, { order: resolution.order, lineIds: new Map() });
    }

    groups.get(orderKey).lineIds.set(lineId, entry);
  }

  return groups;
};

const setLineResults = (lineResults, lineIds, errorMessage) => {
  for (const lineId of lineIds) {
    lineResults.set(String(lineId), { errorMessage });
  }
};

const getShipmentCoveredLineIds = (shipment, lineIds) => {
  const productLineIds = new Set((shipment?.products || []).map((product) => String(product.orderLineId)));
  return new Set(lineIds.filter((lineId) => productLineIds.has(String(lineId))));
};

const createShipmentForLines = async ({ sellerId, userId, payload, order, qtyByLineId, orderItems, lineResults }) => {
  const lineIds = [...qtyByLineId.keys()];
  const taxByLineId = buildOrderItemTaxMap(orderItems);
  const numericLineIds = parseOrderLineIds(lineIds);

  const pickUpId = await resolveSellerPickUpId(sellerId);
  if (!pickUpId) {
    setLineResults(lineResults, lineIds, 'No active pickup address configured for seller');
    return;
  }

  const products = buildProductsFromOrder(order, qtyByLineId);
  if (!products.length) {
    setLineResults(lineResults, lineIds, 'No shippable order items found');
    return;
  }

  const firstItem = qtyByLineId.values().next().value;
  const pieces = products.reduce((sum, product) => sum + (product.quantity || 0), 0);

  const createResult = await createFullShipmentService({
    id: String(order._id),
    sellerId: String(sellerId),
    userId: String(userId),
    pickUpId,
    products,
    pieces,
    length: payload.boxLength,
    width: payload.boxWidth,
    height: payload.boxHeight,
    weight: payload.weight,
    invoice_number: firstItem?.invoiceNumber,
    invoice_date: firstItem?.invoiceDate,
  });

  if (!createResult?.success) {
    setLineResults(lineResults, lineIds, createResult?.message || 'Shipment could not be created');
    return;
  }

  const createdShipment = await findShipmentByOrderLineIds(sellerId, numericLineIds);
  if (createdShipment) {
    await applyShipmentDetailsUpdate(createdShipment._id, payload, orderItems, taxByLineId);
  }

  setLineResults(lineResults, lineIds, '');
};

const processOrderShipmentGroup = async ({
  sellerId,
  userId,
  payload,
  order,
  qtyByLineId,
  orderItems,
  lineResults,
}) => {
  const lineIds = [...qtyByLineId.keys()];
  const numericLineIds = parseOrderLineIds(lineIds);
  const existingShipment = await findShipmentByOrderLineIds(sellerId, numericLineIds);

  if (existingShipment) {
    const coveredLineIds = getShipmentCoveredLineIds(existingShipment, lineIds);

    if (coveredLineIds.size === lineIds.length) {
      const taxByLineId = buildOrderItemTaxMap(orderItems);
      await applyShipmentDetailsUpdate(existingShipment._id, payload, orderItems, taxByLineId);
      setLineResults(lineResults, lineIds, '');
      return;
    }

    if (coveredLineIds.size > 0) {
      const coveredLineIdsArray = [...coveredLineIds];
      const coveredOrderItems = orderItems.filter((item) => coveredLineIds.has(String(item.orderItemId)));
      const coveredTaxByLineId = buildOrderItemTaxMap(coveredOrderItems);
      await applyShipmentDetailsUpdate(existingShipment._id, payload, coveredOrderItems, coveredTaxByLineId);
      setLineResults(lineResults, coveredLineIdsArray, '');

      const uncoveredQtyByLineId = new Map(
        [...qtyByLineId.entries()].filter(([lineId]) => !coveredLineIds.has(String(lineId)))
      );
      const uncoveredOrderItems = orderItems.filter((item) => !coveredLineIds.has(String(item.orderItemId)));

      await createShipmentForLines({
        sellerId,
        userId,
        payload,
        order,
        qtyByLineId: uncoveredQtyByLineId,
        orderItems: uncoveredOrderItems,
        lineResults,
      });
      return;
    }
  }

  await createShipmentForLines({
    sellerId,
    userId,
    payload,
    order,
    qtyByLineId,
    orderItems,
    lineResults,
  });
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

export const postShipmentDetailsService = async (sellerId, userId, payload) => {
  const { orderItems = [] } = payload;
  const lineResults = new Map();

  if (!orderItems.length) {
    return { status: 'FAILED', orderItems: [] };
  }

  if (!userId) {
    return {
      status: 'FAILED',
      orderItems: orderItems.map((item) => ({
        orderItemId: String(item.orderItemId),
        errorMessage: 'User context is required to create shipment',
      })),
    };
  }

  const qtyByLineId = aggregateOrderItemQuantities(orderItems);
  const resolved = await resolveOrdersForLineIds(sellerId, qtyByLineId);

  for (const [lineId, resolution] of resolved) {
    if (resolution.errorMessage) {
      lineResults.set(lineId, { errorMessage: resolution.errorMessage });
    }
  }

  const unresolvedLineIds = [...qtyByLineId.keys()].filter((lineId) => !lineResults.has(lineId));
  const processableQtyByLineId = new Map([...qtyByLineId.entries()].filter(([lineId]) => !lineResults.has(lineId)));

  const orderGroups = groupLineIdsByOrder(processableQtyByLineId, resolved);

  for (const { order, lineIds: groupLineIds } of orderGroups.values()) {
    const groupOrderItems = orderItems.filter((item) => groupLineIds.has(String(item.orderItemId)));

    try {
      await processOrderShipmentGroup({
        sellerId,
        userId,
        payload,
        order,
        qtyByLineId: groupLineIds,
        orderItems: groupOrderItems,
        lineResults,
      });
    } catch (error) {
      console.error('postShipmentDetailsService group error:', error.message, error.stack);
      setLineResults(lineResults, [...groupLineIds.keys()], error.message || 'Shipment processing failed');
    }
  }

  for (const lineId of unresolvedLineIds) {
    if (!lineResults.has(lineId)) {
      lineResults.set(lineId, { errorMessage: 'Order item not processed' });
    }
  }

  const responseItems = orderItems.map((item) => {
    const lineId = String(item.orderItemId);
    const result = lineResults.get(lineId);

    return {
      orderItemId: lineId,
      errorMessage: result?.errorMessage ?? 'Order item not processed',
    };
  });

  const successCount = responseItems.filter((item) => item.errorMessage === '').length;
  let status = 'FAILED';

  if (successCount === orderItems.length) {
    status = 'SUCCESS';
  } else if (successCount > 0) {
    status = 'PARTIAL_SUCCESS';
  }

  return { status, orderItems: responseItems };
};
