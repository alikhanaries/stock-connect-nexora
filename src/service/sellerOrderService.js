import mongoose from 'mongoose';
import SellerOrder from '#root/src/models/OrderSchema/SellerOrder.js';
import Order from '#root/src/models/Orders.js';
import Product from '#root/src/models/Product.js';
import { normalizeOrderSku, resolveSellerIdsForStoredSkus } from '../helpers/orderSellerResolution.js';

const STATUS = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELED',
  RETURNED: 'RETURNED',
  CLOSED: 'CLOSED',
};

/** Derive StockConnect fulfillment status from activity — not raw CE marketplace status. */
export const deriveSkuStatusFromFulfillment = ({
  breakdown = {},
  qty = 0,
  honorInvoiceInProgress = false,
  storedStatus = '',
} = {}) => {
  const confirmed = breakdown.confirmed || 0;
  const shipped = breakdown.shipped || 0;
  const delivered = breakdown.delivered || 0;
  const canceled = breakdown.canceled || 0;
  const returned = breakdown.returned || 0;
  const shipmentCreated = breakdown.shipmentCreated || 0;
  const stored = (storedStatus || '').toUpperCase();

  if (canceled === qty) return STATUS.CANCELED;
  if (returned === qty) return STATUS.RETURNED;
  if (delivered === qty) return STATUS.DELIVERED;
  if (shipmentCreated > 0 || (confirmed > 0 && confirmed < qty)) {
    if (shipped === qty) return STATUS.SHIPPED;
    return STATUS.IN_PROGRESS;
  }
  if (shipped > 0) return STATUS.SHIPPED;
  if (honorInvoiceInProgress && stored === STATUS.IN_PROGRESS) return STATUS.IN_PROGRESS;
  return STATUS.NEW;
};

export const hasLocalShipmentFulfillment = (existingSku) => {
  if (!existingSku) return false;

  const shipmentCreated = existingSku?.statusBreakdown?.shipmentCreated || 0;
  const airWaybillNo = String(existingSku?.airWaybillNo || '').trim();

  return shipmentCreated > 0 || airWaybillNo.length > 0;
};

export const orderHasLocalShipmentFulfillment = (existingOrder) => {
  const skus = existingOrder?.orderSkuList?.skuList || [];
  return skus.some(hasLocalShipmentFulfillment);
};

const mergeLocalShipmentBreakdown = (breakdown, existingSku, qty) => {
  if (!hasLocalShipmentFulfillment(existingSku)) {
    return breakdown;
  }

  const merged = {
    confirmed: breakdown?.confirmed ?? 0,
    shipmentCreated: breakdown?.shipmentCreated ?? 0,
    shipped: breakdown?.shipped ?? 0,
    delivered: breakdown?.delivered ?? 0,
    returned: breakdown?.returned ?? 0,
    canceled: breakdown?.canceled ?? 0,
  };

  const prevCreated = existingSku?.statusBreakdown?.shipmentCreated || 0;
  merged.shipmentCreated = Math.max(merged.shipmentCreated, prevCreated);

  if (merged.shipmentCreated === 0 && existingSku?.airWaybillNo) {
    merged.shipmentCreated = prevCreated > 0 ? prevCreated : Math.min(qty || 0, 1);
  }

  const used = merged.shipmentCreated + merged.shipped + merged.delivered + merged.returned + merged.canceled;
  merged.confirmed = Math.max((qty || 0) - used, 0);

  return merged;
};

/** Shared CE/OCP stored SKU status — fulfillment rules, not channel marketplace status. */
export const resolveStoredSkuStatus = ({ breakdown, qty, existingSku, extraDelivered = false }) => {
  if (extraDelivered) return STATUS.DELIVERED;
  if (['SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELED'].includes(existingSku?.status)) {
    return existingSku.status;
  }
  if ((existingSku?.status || '').toUpperCase() === STATUS.IN_PROGRESS && existingSku?.documentId) {
    return STATUS.IN_PROGRESS;
  }

  const effectiveBreakdown = mergeLocalShipmentBreakdown(breakdown, existingSku, qty);

  return deriveSkuStatusFromFulfillment({
    breakdown: effectiveBreakdown,
    qty,
    honorInvoiceInProgress: Boolean(existingSku?.documentId),
    storedStatus: existingSku?.status,
  });
};

const buildProductEntry = (sku, price, qty) => ({
  productId: sku.id || null,
  merchantProductNo: sku.merchantProductNo || null,
  quantity: qty,
  lineTotalInclVat: qty * price || 0,
  lineVat: sku.lineVat || 0,
  originalUnitPriceInclVat: sku.originalUnitPriceInclVat || price,
  originalUnitVat: sku.originalUnitVat || 0,
  vatRate: sku.vatRate || 0,
});

const createSellerMapEntry = (sellerId, orderId) => ({
  totalAmount: 0,
  deliveredAmount: 0,
  canceledAmount: 0,
  returnedAmount: 0,
  netAmount: 0,
  totalQuantity: 0,
  totalSkus: 0,
  sellerOrderId: `${orderId}_${sellerId}`,
  products: [],
  statusBreakdown: {
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    canceled: 0,
    returned: 0,
    shipmentCreated: 0,
  },
  statusCounts: {
    NEW: 0,
    IN_PROGRESS: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELED: 0,
    RETURNED: 0,
    SHIPMENT_CREATED: 0,
  },
});

/**
 * Build the SellerOrder bulkWrite ops for one order — pure, no DB call.
 * Shared by the single-order path (upsertSellerOrdersFromOrder) and the
 * batch path (buildSellerOrderBulkOpsBatch) so a whole sync run can be
 * flushed in one bulkWrite instead of one bulkWrite per order.
 */
const buildSellerOrderBulkOps = (orderPayload) => {
  const { orderId, orderDate, channelId, channelName, orderSkuList } = orderPayload;

  const skuList = orderSkuList?.skuList || [];

  const sellerMap = {};

  // -----------------------------
  // PROCESS SKUs
  // -----------------------------
  skuList.forEach((sku) => {
    const sellerId = sku.sellerId?.toString();
    if (!sellerId) return;

    if (!sellerMap[sellerId]) {
      sellerMap[sellerId] = createSellerMapEntry(sellerId, orderId);
    }

    const data = sellerMap[sellerId];

    const price = sku.unitPriceInclVat || 0;
    const qty = sku.quantity || 0;

    const breakdown = sku.statusBreakdown || {};

    const confirmed = breakdown.confirmed || 0;
    const shipped = breakdown.shipped || 0;
    const delivered = breakdown.delivered || 0;
    const canceled = breakdown.canceled || 0;
    const returned = breakdown.returned || 0;
    const shipmentCreated = breakdown.shipmentCreated || 0;

    data.products.push(buildProductEntry(sku, price, qty));

    // -----------------------------
    // TOTALS
    // -----------------------------
    data.totalQuantity += qty;
    data.totalSkus += 1;

    data.totalAmount += qty * price;
    data.deliveredAmount += delivered * price;
    data.canceledAmount += canceled * price;
    data.returnedAmount += returned * price;

    // -----------------------------
    // BREAKDOWN
    // -----------------------------
    data.statusBreakdown.confirmed += confirmed;
    data.statusBreakdown.shipped += shipped;
    data.statusBreakdown.delivered += delivered;
    data.statusBreakdown.canceled += canceled;
    data.statusBreakdown.returned += returned;
    data.statusBreakdown.shipmentCreated += shipmentCreated;

    // -----------------------------
    // DERIVE SKU STATUS
    // -----------------------------
    let skuStatus = (sku.status || '').toUpperCase();

    if (!skuStatus) {
      if (canceled === qty) skuStatus = STATUS.CANCELED;
      else if (returned === qty) skuStatus = STATUS.RETURNED;
      else if (delivered === qty) skuStatus = STATUS.DELIVERED;
      // IN_PROGRESS must come before SHIPPED
      // confirmed === qty means nothing processed yet → stay NEW
      else if (shipmentCreated > 0 || (confirmed > 0 && confirmed < qty)) skuStatus = STATUS.IN_PROGRESS;
      else if (shipped > 0) skuStatus = STATUS.SHIPPED;
      else skuStatus = STATUS.NEW;
    }

    if (data.statusCounts[skuStatus] !== undefined) {
      data.statusCounts[skuStatus] += 1;
    }
  });

  if (!Object.keys(sellerMap).length) {
    console.warn(`upsertSellerOrdersFromOrder: no resolvable sellerId for any SKU on orderId=${orderId}, skipping`);
    return [];
  }

  // -----------------------------
  // NET AMOUNT
  // -----------------------------
  Object.values(sellerMap).forEach((data) => {
    data.netAmount = data.totalAmount - data.canceledAmount - data.returnedAmount;
    data.finalStatus = deriveSellerStatus(data.statusCounts, data.totalSkus);
  });

  // -----------------------------
  // BULK OPS
  // -----------------------------
  return Object.entries(sellerMap).map(([sellerId, data]) => {
    const sellerOrderId = data.sellerOrderId;

    return {
      updateOne: {
        filter: { sellerOrderId },
        update: {
          $set: {
            sellerOrderId,
            orderId,
            sellerId,
            orderDate,
            channelId,
            channelName,

            status: data.finalStatus,

            products: data.products,

            totalAmount: Number(data.totalAmount.toFixed(2)),
            deliveredAmount: Number(data.deliveredAmount.toFixed(2)),
            canceledAmount: Number(data.canceledAmount.toFixed(2)),
            returnedAmount: Number(data.returnedAmount.toFixed(2)),
            netAmount: Number(data.netAmount.toFixed(2)),

            totalQuantity: data.totalQuantity,
            totalSkus: data.totalSkus,

            statusBreakdown: data.statusBreakdown,
          },
        },
        upsert: true,
      },
    };
  });
};

export const upsertSellerOrdersFromOrder = async ({ orderPayload }) => {
  try {
    const bulkOps = buildSellerOrderBulkOps(orderPayload);
    if (!bulkOps.length) return true;

    await SellerOrder.bulkWrite(bulkOps);

    return true;
  } catch (error) {
    console.error('Error in upsertSellerOrdersFromOrder:', error);
    throw error;
  }
};

const SELLER_ORDER_BULKWRITE_CHUNK_SIZE = 1000;

/**
 * Flush SellerOrder writes for a whole sync batch in a handful of sequential
 * bulkWrite calls instead of one Promise.allSettled'd bulkWrite PER ORDER.
 *
 * Firing hundreds of concurrent bulkWrite calls (one per order) exhausts the
 * Mongo connection pool under load — some calls fail with connection/timeout
 * errors essentially at random, even when their order data is perfectly valid.
 * Building every order's ops in memory first (cheap, synchronous) and writing
 * them in a few chunked bulkWrite calls avoids that entirely.
 */
export const upsertSellerOrdersBatch = async (orderPayloads) => {
  const allOps = [];
  const buildFailures = [];

  for (const { orderPayload } of orderPayloads) {
    try {
      allOps.push(...buildSellerOrderBulkOps(orderPayload));
    } catch (error) {
      buildFailures.push({ orderId: orderPayload?.orderId, error });
      console.error(
        `upsertSellerOrdersBatch: failed to build ops for orderId=${orderPayload?.orderId}:`,
        error.message
      );
    }
  }

  let writeFailures = 0;
  for (let i = 0; i < allOps.length; i += SELLER_ORDER_BULKWRITE_CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + SELLER_ORDER_BULKWRITE_CHUNK_SIZE);
    try {
      await SellerOrder.bulkWrite(chunk, { ordered: false });
    } catch (error) {
      writeFailures += chunk.length;
      console.error(`upsertSellerOrdersBatch: bulkWrite chunk [${i}, ${i + chunk.length}) FAILED:`, error.message);
    }
  }

  return { totalOps: allOps.length, buildFailures: buildFailures.length, writeFailures };
};
export const syncSellerOrdersFromOrder = async (orderId) => {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order) return false;

    const { orderSkuList, orderDate, channelId, channelName } = order;
    const skuList = orderSkuList?.skuList || [];

    const sellerMap = {};

    // -----------------------------
    // PROCESS SKUs
    // -----------------------------
    skuList.forEach((sku) => {
      const sellerId = sku.sellerId?.toString();
      if (!sellerId) return;

      if (!sellerMap[sellerId]) {
        sellerMap[sellerId] = createSellerMapEntry(sellerId, order.orderId);
      }

      const data = sellerMap[sellerId];

      const price = sku.unitPriceInclVat || 0;
      const qty = sku.quantity || 0;
      const breakdown = sku.statusBreakdown || {};

      const confirmed = breakdown.confirmed || 0;
      const shipped = breakdown.shipped || 0;
      const delivered = breakdown.delivered || 0;
      const canceled = breakdown.canceled || 0;
      const returned = breakdown.returned || 0;
      const shipmentCreated = breakdown.shipmentCreated || 0;

      data.products.push(buildProductEntry(sku, price, qty));

      // -----------------------------
      // TOTALS
      // -----------------------------
      data.totalQuantity += qty;
      data.totalSkus += 1;

      data.totalAmount += qty * price;
      data.deliveredAmount += delivered * price;
      data.canceledAmount += canceled * price;
      data.returnedAmount += returned * price;

      // -----------------------------
      // BREAKDOWN
      // -----------------------------
      data.statusBreakdown.confirmed += confirmed;
      data.statusBreakdown.shipped += shipped;
      data.statusBreakdown.delivered += delivered;
      data.statusBreakdown.canceled += canceled;
      data.statusBreakdown.returned += returned;
      data.statusBreakdown.shipmentCreated += shipmentCreated;

      // -----------------------------
      //  FINAL SKU STATUS LOGIC
      // -----------------------------
      let skuStatus;

      if (canceled === qty) {
        skuStatus = STATUS.CANCELED;
      } else if (returned === qty) {
        skuStatus = STATUS.RETURNED;
      } else if (delivered === qty) {
        skuStatus = STATUS.DELIVERED;
      }
      //  PARTIAL vs FULL SHIPPED HANDLING
      // confirmed === qty means nothing processed yet → stay NEW
      else if (shipmentCreated > 0 || (confirmed > 0 && confirmed < qty)) {
        if (shipped === qty) {
          skuStatus = STATUS.SHIPPED; // fully shipped
        } else {
          skuStatus = STATUS.IN_PROGRESS; // partially processed
        }
      } else if (shipped > 0) {
        skuStatus = STATUS.SHIPPED;
      } else if ((sku.status || '').toUpperCase() === 'IN_PROGRESS') {
        // SKU marked IN_PROGRESS by invoice upload/generate (no shipment activity yet)
        skuStatus = STATUS.IN_PROGRESS;
      } else {
        skuStatus = STATUS.NEW;
      }

      data.statusCounts[skuStatus] += 1;
    });

    if (!Object.keys(sellerMap).length) {
      console.warn(`syncSellerOrdersFromOrder: no resolvable sellerId for any SKU on orderId=${orderId}, skipping`);
      return true;
    }

    // -----------------------------
    // FINAL CALCULATIONS
    // -----------------------------
    Object.values(sellerMap).forEach((data) => {
      data.netAmount = data.totalAmount - data.canceledAmount - data.returnedAmount;

      data.finalStatus = deriveSellerStatus(data.statusCounts, data.totalSkus);
    });

    // -----------------------------
    // BULK UPDATE
    // -----------------------------
    const bulkOps = Object.entries(sellerMap).map(([sellerId, data]) => {
      const sellerOrderId = `${order.orderId}_${sellerId}`;

      return {
        updateOne: {
          filter: { sellerOrderId },
          update: {
            $set: {
              sellerOrderId,
              orderId: order.orderId,
              sellerId,
              orderDate,
              channelId,
              channelName,

              status: data.finalStatus,

              products: data.products,

              totalAmount: +data.totalAmount.toFixed(2),
              deliveredAmount: +data.deliveredAmount.toFixed(2),
              canceledAmount: +data.canceledAmount.toFixed(2),
              returnedAmount: +data.returnedAmount.toFixed(2),
              netAmount: +data.netAmount.toFixed(2),

              totalQuantity: data.totalQuantity,
              totalSkus: data.totalSkus,

              statusBreakdown: data.statusBreakdown,
            },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length) {
      await SellerOrder.bulkWrite(bulkOps);
    }

    return true;
  } catch (error) {
    console.error('syncSellerOrdersFromOrder error:', error);
    throw error;
  }
};

/**
 * Repair channelengineorders that never got sellerorders rows.
 * Resolves seller from Product map or stored ExtraData.sellerId, then upserts sellerorders.
 * UI list reads sellerorders — without this, orphan CE orders stay invisible.
 */
export const backfillMissingSellerOrders = async (sellerId = null) => {
  try {
    const sellerIdStr = sellerId ? String(sellerId) : null;
    const orphaned = await Order.aggregate([
      {
        $lookup: {
          from: 'sellerorders',
          localField: 'orderId',
          foreignField: 'orderId',
          as: 'so',
        },
      },
      {
        $match: {
          so: { $size: 0 },
          'orderSkuList.skuList.0': { $exists: true },
        },
      },
      {
        $project: {
          orderId: 1,
          orderDate: 1,
          channelId: 1,
          channelName: 1,
          orderSkuList: 1,
        },
      },
      { $limit: 3000 },
    ]);

    if (!orphaned.length) {
      return { repaired: 0, scanned: 0, repairedForSeller: 0 };
    }

    const skuSet = new Set();
    for (const order of orphaned) {
      for (const sku of order.orderSkuList?.skuList || []) {
        if (sku.merchantProductNo) skuSet.add(sku.merchantProductNo);
      }
    }

    const products = await Product.find({ productSkuCode: { $in: [...skuSet] } })
      .select('productSkuCode sellerId')
      .collation({ locale: 'en', strength: 2 })
      .lean();
    const productSellerMap = new Map(products.map((p) => [normalizeOrderSku(p.productSkuCode), p.sellerId]));

    let repaired = 0;
    let repairedForSeller = 0;
    let failed = 0;

    for (const order of orphaned) {
      try {
        const skuList = [...(order.orderSkuList?.skuList || [])];
        const { sellerIdSet, changed } = await resolveSellerIdsForStoredSkus({
          skuList,
          productSellerMap,
        });

        if (!sellerIdSet.size) continue;

        const sellerIds = [...sellerIdSet].map((id) => new mongoose.Types.ObjectId(id));

        if (changed || !order.sellerIds?.length) {
          await Order.updateOne(
            { _id: order._id },
            {
              $set: {
                'orderSkuList.skuList': skuList,
                sellerIds,
                sellerId: sellerIds[0],
              },
            }
          );
        }

        await upsertSellerOrdersFromOrder({
          orderPayload: {
            orderId: order.orderId,
            orderDate: order.orderDate,
            channelId: order.channelId,
            channelName: order.channelName,
            orderSkuList: { skuList },
          },
        });

        repaired++;
        if (sellerIdStr && sellerIdSet.has(sellerIdStr)) {
          repairedForSeller++;
        }
      } catch (error) {
        failed++;
        console.error(`backfillMissingSellerOrders: failed to repair orderId=${order.orderId}:`, error.message);
      }
    }

    return { repaired, scanned: orphaned.length, repairedForSeller, failed };
  } catch (error) {
    console.error('backfillMissingSellerOrders error:', error.message);
    return { repaired: 0, scanned: 0, repairedForSeller: 0, error: error.message };
  }
};

// -----------------------------
// MAIN HELPER
// -----------------------------
const deriveSellerStatus = (counts, total) => {
  const { NEW = 0, IN_PROGRESS = 0, SHIPPED = 0, DELIVERED = 0, CANCELED = 0, RETURNED = 0 } = counts;

  const closedCount = DELIVERED + RETURNED + CANCELED;

  // -----------------------------
  // 1. FULLY CLOSED
  // -----------------------------
  if (closedCount === total) return STATUS.CLOSED;

  // -----------------------------
  // 2. ALL SAME
  // -----------------------------
  if (NEW === total) return STATUS.NEW;
  if (IN_PROGRESS === total) return STATUS.IN_PROGRESS;
  if (SHIPPED === total) return STATUS.SHIPPED;

  // -----------------------------
  // 3. PRIORITY RULES (FIXED)
  // -----------------------------
  if (IN_PROGRESS > 0) return STATUS.IN_PROGRESS;

  // NEW + SHIPPED/DELIVERED is not a valid business flow (shipments are created for the order as a whole)
  if (SHIPPED > 0) return STATUS.SHIPPED;

  // -----------------------------
  // 4. PARTIAL FINAL STATES
  // -----------------------------
  if (DELIVERED > 0 || RETURNED > 0 || CANCELED > 0) {
    return STATUS.IN_PROGRESS;
  }

  // -----------------------------
  // 5. DEFAULT
  // -----------------------------
  return STATUS.IN_PROGRESS;
};

/** Derive seller-order row status from resolved SKU statuses (same rules for every brand/channel). */
export const deriveSellerOrderStatusFromSkus = (skuList = []) => {
  const counts = {
    NEW: 0,
    IN_PROGRESS: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELED: 0,
    RETURNED: 0,
  };

  skuList.forEach((sku) => {
    const st = (sku.status || STATUS.NEW).toUpperCase();
    if (counts[st] !== undefined) counts[st]++;
  });

  return deriveSellerStatus(counts, skuList.length);
};
