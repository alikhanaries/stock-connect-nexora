import { ObjectId } from 'mongodb';
import Order from '#root/src/models/Orders.js';
import OrderLogs from '#root/src/models/OrderLogs.js';
import { syncSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';
import {
  collapseNotificationOrderItems,
  deriveOrderStatusFromSkus,
  mapUniwareNotificationSkuStatus,
  parseUniwareUpdatedAt,
} from '../helpers/mapUniwareNotificationStatus.js';

export const buildResponse = (responseItems) => {
  const failures = responseItems.filter((i) => i.errorMessage);
  const successCount = responseItems.length - failures.length;

  let status = 'FAILED';
  if (failures.length === 0) {
    status = 'SUCCESS';
  } else if (successCount > 0) {
    status = 'PARTIAL_SUCCESS';
  }

  return {
    status,
    orderItems: failures,
    ...(failures.length ? { error: failures.map((f) => f.errorMessage).join('; ') } : {}),
  };
};

const resolveIsReverse = (item) => {
  if (typeof item?.IsReverse === 'boolean') return item.IsReverse;
  if (typeof item?.isReverse === 'boolean') return item.isReverse;
  return false;
};

const findOrderForNotification = async (sellerId, orderIdParam) => {
  const sellerObjectId = ObjectId.isValid(sellerId) ? new ObjectId(sellerId) : sellerId;
  const normalizedId = String(orderIdParam || '').trim();

  const idFilters = [{ orderId: normalizedId }, { channelOrderNumber: normalizedId }];
  if (ObjectId.isValid(normalizedId)) {
    idFilters.unshift({ _id: new ObjectId(normalizedId) });
  }

  return Order.findOne({
    $and: [{ $or: [{ sellerId: sellerObjectId }, { sellerIds: sellerObjectId }] }, { $or: idFilters }],
  });
};

const applySkuNotification = (sku, item) => {
  const isReverse = resolveIsReverse(item);
  const uniwareStatus = String(item.status || '').toUpperCase();
  const mappedStatus = mapUniwareNotificationSkuStatus(uniwareStatus, isReverse);

  sku.status = mappedStatus;

  if (item.courier_status) {
    sku.extraData = sku.extraData || [];
    const existing = sku.extraData.find((e) => e.key === 'courier_status');
    if (existing) {
      existing.value = String(item.courier_status);
    } else {
      sku.extraData.push({ key: 'courier_status', value: String(item.courier_status) });
    }
  }

  if (isReverse && uniwareStatus === 'COURIER_ALLOCATED') {
    const returnAwb = item.returnAwb || item.returnAWB;
    if (returnAwb) {
      sku.airWaybillNo = String(returnAwb);
    }
    const courierName = item.reversePickupCourierName || item.reversePickupCourierCode;
    if (courierName) {
      sku.extraData = sku.extraData || [];
      sku.extraData.push({ key: 'reversePickupCourier', value: String(courierName) });
    }
  }

  if (!isReverse && (uniwareStatus === 'DISPATCHED' || uniwareStatus === 'SHIPPED')) {
    const sb = sku.statusBreakdown || {
      confirmed: sku.quantity || 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      canceled: 0,
      shipmentCreated: 0,
    };
    const qty = sku.quantity || 1;
    if ((sb.shipped || 0) < qty) {
      sb.shipped = qty;
      sb.shipmentCreated = Math.max(0, (sb.shipmentCreated || 0) - qty);
    }
    sku.statusBreakdown = sb;
  }

  if (!isReverse && uniwareStatus === 'DELIVERED') {
    const sb = sku.statusBreakdown || {
      confirmed: 0,
      shipped: sku.quantity || 0,
      delivered: 0,
      returned: 0,
      canceled: 0,
      shipmentCreated: 0,
    };
    const qty = sku.quantity || 1;
    sb.delivered = qty;
    sb.shipped = qty;
    sb.shipmentCreated = 0;
    sku.statusBreakdown = sb;
  }
};

export const postOrderStatusNotification = async (sellerId, orderIdParam, payload = {}) => {
  const responseItems = [];
  const rawItems = Array.isArray(payload.orderItems) ? payload.orderItems : [];

  if (!rawItems.length) {
    return buildResponse([{ orderItemId: '', errorMessage: 'orderItems is required' }]);
  }

  const order = await findOrderForNotification(sellerId, orderIdParam);
  if (!order) {
    return buildResponse(
      collapseNotificationOrderItems(rawItems).map((item) => ({
        orderItemId: String(item.orderItemId),
        errorMessage: 'Order not found',
      }))
    );
  }

  const collapsedItems = collapseNotificationOrderItems(rawItems);
  const skuList = order.orderSkuList?.skuList || [];
  let anyUpdated = false;

  for (const item of collapsedItems) {
    const lineId = Number(item.orderItemId);
    if (Number.isNaN(lineId)) {
      responseItems.push({
        orderItemId: String(item.orderItemId),
        errorMessage: 'Invalid orderItemId',
      });
      continue;
    }

    const sku = skuList.find((s) => Number(s.id) === lineId);
    if (!sku) {
      responseItems.push({
        orderItemId: String(item.orderItemId),
        errorMessage: 'Order item not found',
      });
      continue;
    }

    applySkuNotification(sku, item);
    anyUpdated = true;

    responseItems.push({
      orderItemId: String(item.orderItemId),
      errorMessage: '',
    });
  }

  const result = buildResponse(responseItems);

  if (anyUpdated && result.status !== 'FAILED') {
    order.orderSkuList.skuList = skuList;
    order.status = deriveOrderStatusFromSkus(skuList);
    order.markModified('orderSkuList');
    await order.save();

    const latestUpdated = collapsedItems.reduce((max, item) => {
      const ts = parseUniwareUpdatedAt(item.updated);
      return ts > max ? ts : max;
    }, new Date(0));

    await OrderLogs.updateOne(
      { orderId: order._id },
      {
        $push: {
          details: {
            status: order.status,
            description: `UniCommerce status notification (${result.status})`,
            createdAt: latestUpdated,
          },
        },
      },
      { upsert: true }
    );

    await syncSellerOrdersFromOrder(order._id);
  }

  return result;
};

export default {
  postOrderStatusNotification,
  buildResponse,
  findOrderForNotification,
};
