import SellerOrder from '#root/src/models/OrderSchema/SellerOrder.js';
import Order from '#root/src/models/Orders.js';
export const upsertSellerOrdersFromOrder = async ({ orderPayload }) => {
  try {
    const { orderId, orderDate, channelId, channelName, orderSkuList } = orderPayload;

    const skuList = orderSkuList?.skuList || [];

    const sellerMap = {};

    skuList.forEach((sku) => {
      const sellerId = sku.sellerId?.toString();
      if (!sellerId) return;

      if (!sellerMap[sellerId]) {
        sellerMap[sellerId] = {
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
        };
      }

      const price = sku.unitPriceInclVat || 0;
      const qty = sku.quantity || 0;

      const breakdown = sku.statusBreakdown || {};

      const confirmed = breakdown.confirmed || 0;
      const shipped = breakdown.shipped || 0;
      const delivered = breakdown.delivered || 0;
      const canceled = breakdown.canceled || 0;
      const returned = breakdown.returned || 0;
      const shipmentCreated = breakdown.shipmentCreated || 0;

      // -----------------------------
      //  PRODUCTS ARRAY BUILD
      // -----------------------------
      sellerMap[sellerId].products.push({
        productId: sku.id || null,
        merchantProductNo: sku.merchantProductNo || null,
        quantity: qty,
        lineTotalInclVat: qty * price || 0,
        lineVat: sku.lineVat || 0,
        originalUnitPriceInclVat: sku.originalUnitPriceInclVat || price,
        originalUnitVat: sku.originalUnitVat || 0,
        vatRate: sku.vatRate || 0,
      });

      // -----------------------------
      // TOTALS
      // -----------------------------
      sellerMap[sellerId].totalSkus += 1;
      sellerMap[sellerId].totalQuantity += qty;

      sellerMap[sellerId].totalAmount += qty * price;
      sellerMap[sellerId].deliveredAmount += delivered * price;
      sellerMap[sellerId].canceledAmount += canceled * price;
      sellerMap[sellerId].returnedAmount += returned * price;

      // -----------------------------
      // STATUS BREAKDOWN
      // -----------------------------
      sellerMap[sellerId].statusBreakdown.confirmed += confirmed;
      sellerMap[sellerId].statusBreakdown.shipped += shipped;
      sellerMap[sellerId].statusBreakdown.delivered += delivered;
      sellerMap[sellerId].statusBreakdown.canceled += canceled;
      sellerMap[sellerId].statusBreakdown.returned += returned;
      sellerMap[sellerId].statusBreakdown.shipmentCreated += shipmentCreated;
      sellerMap[sellerId].status = sku.status;
    });

    if (!Object.keys(sellerMap).length) {
      console.warn(' No seller data for order:', orderId);
      return true;
    }

    // -----------------------------
    // NET AMOUNT
    // -----------------------------
    Object.values(sellerMap).forEach((data) => {
      data.netAmount = data.totalAmount - data.canceledAmount - data.returnedAmount;
    });

    // -----------------------------
    // BULK OPS
    // -----------------------------
    const bulkOps = Object.entries(sellerMap).map(([sellerId, data]) => {
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
              status: data.status,

              products: data.products, //  NEW

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

    await SellerOrder.bulkWrite(bulkOps);

    return true;
  } catch (error) {
    console.error('Error in upsertSellerOrdersFromOrder:', error);
    throw error;
  }
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
        sellerMap[sellerId] = {
          totalAmount: 0,
          deliveredAmount: 0,
          canceledAmount: 0,
          returnedAmount: 0,
          netAmount: 0,
          totalQuantity: 0,
          totalSkus: 0,

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
        };
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
        else if (shipped > 0) skuStatus = STATUS.SHIPPED;
        else if (shipmentCreated > 0) skuStatus = STATUS.IN_PROGRESS;
        else if (confirmed > 0) skuStatus = STATUS.IN_PROGRESS;
        else skuStatus = STATUS.NEW;
      }

      if (data.statusCounts[skuStatus] !== undefined) {
        data.statusCounts[skuStatus] += 1;
      }
    });

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

const STATUS = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELED',
  RETURNED: 'RETURNED',
  CLOSED: 'CLOSED',
};

// -----------------------------
// MAIN HELPER
// -----------------------------
const deriveSellerStatus = (counts, total) => {
  const { NEW = 0, IN_PROGRESS = 0, SHIPPED = 0, DELIVERED = 0, CANCELED = 0, RETURNED = 0 } = counts;

  // -----------------------------
  // 1. ALL SAME
  // -----------------------------
  if (NEW === total) return 'NEW';
  if (IN_PROGRESS === total) return 'IN_PROGRESS';
  if (SHIPPED === total) return 'SHIPPED';
  if (DELIVERED === total) return 'CLOSED';
  if (CANCELED === total) return 'CANCELED';
  if (RETURNED === total) return 'RETURNED';

  // -----------------------------
  // 2. SPECIAL MIX RULES
  // -----------------------------

  //  Delivered dominates everything
  if (DELIVERED > 0) return 'CLOSED';

  //  Only shipped + canceled → SHIPPED
  if (SHIPPED > 0 && CANCELED > 0 && SHIPPED + CANCELED === total) {
    return 'SHIPPED';
  }

  // -----------------------------
  // 3. DEFAULT MIXED CASE
  // -----------------------------
  return 'IN_PROGRESS';
};
