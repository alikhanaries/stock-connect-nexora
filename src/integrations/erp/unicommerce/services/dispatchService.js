import { convetDateToUTC } from '#root/src/helpers/Common.js';
import OrderLogs from '#root/src/models/OrderLogs.js';
import Order from '#root/src/models/Orders.js';
import DeliveryAddress from '#root/src/models/Shipment/DeliveryAdress.js';
import Shipment from '#root/src/models/Shipment/Shipment.js';
import {
  createShipmentWithChannelEngine,
  getPickUpAddress,
  saveDeliveryAddress,
} from '#root/src/service/shipmentService.js';

export const orderDispatch = async (sellerId, userId, payload) => {
  const responseItems = [];

  try {
    const { orderItems = [], selfShipping = {} } = payload;

    if (!orderItems.length) {
      return {
        status: 'FAILED',
        orderItems: [],
      };
    }

    const { deliveryPartner, dispatchDate, invoiceNumber, trackingId } = selfShipping;

    if (!trackingId) {
      throw new Error('trackingId is required');
    }

    /* ----------- FIND ORDER ----------- */

    const lineIds = orderItems.map((i) => Number(i.orderItemId));

    const order = await Order.findOne({
      sellerId,
      'orderSkuList.skuList.id': { $in: lineIds },
    }).lean();

    if (!order) {
      return {
        status: 'FAILED',
        orderItems: orderItems.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: 'Order not found',
        })),
      };
    }

    /* ----------- PROCESS EACH ITEM ----------- */

    for (const item of orderItems) {
      try {
        const sku = order.orderSkuList.skuList.find((s) => String(s.id) === String(item.orderItemId));

        if (!sku) {
          throw new Error('Order item not found');
        }

        const shipmentData = {
          orderId: order._id,
          sellerId,
          userId,
          airWaybillNo: trackingId,
          merchantShipmentNo: invoiceNumber || `MS-${Date.now()}`,
          method: deliveryPartner,
          description: `Invoice ${invoiceNumber || ''}`,
          products: [
            {
              merchantProductNo: sku.merchantProductNo,
              orderLineId: sku.id,
              quantity: item.quantity,
            },
          ],
          shipmentDate: dispatchDate ? new Date(dispatchDate) : new Date(),
        };

        await createManualShipmentService(shipmentData);

        responseItems.push({
          orderItemId: item.orderItemId,
          errorMessage: '',
        });
      } catch (err) {
        responseItems.push({
          orderItemId: item.orderItemId,
          errorMessage: err.message || 'Dispatch failed',
        });
      }
    }

    /* ----------- FINAL STATUS ----------- */

    const successCount = responseItems.filter((i) => !i.errorMessage).length;

    let status = 'FAILED';

    if (successCount === orderItems.length) {
      status = 'SUCCESS';
    } else if (successCount > 0) {
      status = 'PARTIAL_SUCCESS';
    }

    return {
      status,
      orderItems: responseItems,
    };
  } catch (error) {
    console.error('orderDispatch error:', error);

    return {
      status: 'FAILED',
      orderItems:
        payload?.orderItems?.map((item) => ({
          orderItemId: item.orderItemId,
          errorMessage: error.message,
        })) || [],
    };
  }
};

export const createManualShipmentService = async (shipmentData) => {
  try {
    const {
      orderId,
      sellerId,
      userId,
      pickUpId = null,
      airWaybillNo,
      merchantShipmentNo,
      method,
      products = [],
      trackTraceUrl = '',
      shippedFromCountryCode = 'SA',
      description = '',
    } = shipmentData;

    /* -------------------- VALIDATION -------------------- */
    const missingFields = [];
    if (!orderId) missingFields.push('orderId');
    if (!sellerId) missingFields.push('sellerId');
    if (!userId) missingFields.push('userId');
    if (!airWaybillNo) missingFields.push('airWaybillNo');
    if (!merchantShipmentNo) missingFields.push('merchantShipmentNo');
    if (!products || products.length === 0) missingFields.push('products');

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    /* -------------------- PARALLEL FETCH -------------------- */

    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error(`Order with ID ${orderId} not found`);
    const [existingMerchantShipment, existingAwb] = await Promise.all([
      Shipment.findOne({ merchantShipmentNo }),
      Shipment.findOne({ airWaybillNo }),
    ]);

    if (existingMerchantShipment) throw new Error(`Merchant shipment number '${merchantShipmentNo}' already exists`);
    if (existingAwb) throw new Error(`AWB number '${airWaybillNo}' already exists`);

    /* -------------------- ORDER SKU MAP -------------------- */
    const orderSkuMap = new Map();
    order.orderSkuList?.skuList?.forEach((sku) => {
      orderSkuMap.set(sku.merchantProductNo.toLowerCase(), sku);
    });

    /* -------------------- EXISTING SHIPMENTS -------------------- */
    const productLineIds = products.map((p) => String(p.orderLineId));

    const existingShipments = await Shipment.find({
      orderId,
      status: { $in: ['SHIPMENT_CREATED', 'SHIPPED', 'DELIVERED'] },
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    const shippedQtyMap = {};
    existingShipments.forEach((shipment) => {
      shipment.products?.forEach((p) => {
        const id = String(p.orderLineId);
        shippedQtyMap[id] = (shippedQtyMap[id] || 0) + (p.quantity || 0);
      });
    });

    /* -------------------- PRODUCT VALIDATION -------------------- */
    const validatedProducts = [];

    for (const product of products) {
      const orderSku = orderSkuMap.get(product.merchantProductNo.toLowerCase());
      if (!orderSku) throw new Error(`Product ${product.merchantProductNo} not found in order`);

      if (product.quantity <= 0) throw new Error(`Invalid quantity for ${product.merchantProductNo}`);
      const orderedQty = orderSku.quantity || 0;
      const cancelledQty = orderSku.cancellationRequestedQuantity || 0;
      const availableQty = orderedQty - cancelledQty;

      const alreadyShipped = shippedQtyMap[String(product.orderLineId)] || 0;
      const remainingQty = availableQty - alreadyShipped;

      if (remainingQty <= 0) throw new Error(`All quantity already shipped for ${product.merchantProductNo}`);

      if (product.quantity > remainingQty)
        throw new Error(`Cannot ship ${product.quantity}. Only ${remainingQty} remaining`);

      validatedProducts.push({
        merchantProductNo: product.merchantProductNo,
        orderLineId: product.orderLineId,
        quantity: product.quantity,
        hsCode: orderSku.hsCode || '1111111',
      });
    }

    /* -------------------- PICKUP & DELIVERY -------------------- */

    let pickupData = null;

    if (pickUpId) {
      pickupData = await getPickUpAddress(pickUpId);

      if (!pickupData) {
        throw new Error('Invalid pickup address ID');
      }
    }

    let deliveryId;
    const existingDelivery = await DeliveryAddress.findOne({ orderId }).lean();

    if (existingDelivery) {
      deliveryId = existingDelivery._id;
    } else {
      const savedDelivery = await saveDeliveryAddress({
        orderId,
        name: `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim(),
        email: order.orderCustomer?.email || '',
        phone: order.orderCustomer?.phone || '',
        address: order.orderShippingAddress?.streetName || '',
        city: order.orderShippingAddress?.city || '',
        country: order.orderShippingAddress?.country || '',
        postcode: order.orderShippingAddress?.zipCode || '',
      });
      deliveryId = savedDelivery._id;
    }

    /* -------------------- CREATE SHIPMENT -------------------- */
    const totalPieces = validatedProducts.reduce((s, p) => s + p.quantity, 0);

    /* -------------------- CHANNEL ENGINE -------------------- */
    await createShipmentWithChannelEngine({
      merchantShipmentNo,
      merchantOrderNo: order.merchantOrderNo,
      lines: validatedProducts,
      trackTraceNo: airWaybillNo,
      trackTraceUrl,
      method,
      shippedFromCountryCode,
      shipmentDate: new Date(),
      isMerchantCreator: true,
      airWaybillNo,
    });

    const shipment = await new Shipment({
      orderId,
      sellerId,
      userId,
      deliveryId,
      ...(pickupData && { pickUpId: pickupData._id }),
      airWaybillNo,
      merchantShipmentNo,
      merchantOrderNo: order.merchantOrderNo || order.orderId,
      method,
      shippedFromCountryCode,
      products: validatedProducts,
      pieces: totalPieces,
      status: 'SHIPPED',
      submissionDate: new Date(),
      shipmentMethod: 'UNICOMMERCE',
      isMerchantCreator: true,
      shipmentMerchantDetails: {
        name: method,
        email: 'NA',
      },
      ...(description && { description }),
    }).save();

    /* -------------------- ORDER STATUS LOGIC -------------------- */
    const updatedOrder = await Order.findById(orderId).lean();

    const allShipments = await Shipment.find({
      orderId,
      status: { $ne: 'CANCELED' }, //  ignore cancelled shipments
    }).lean();

    /* --------- TOTAL SHIPPED QTY PER LINE --------- */
    const totalShippedMap = {};
    allShipments.forEach((s) =>
      s.products?.forEach((p) => {
        const id = String(p.orderLineId);
        totalShippedMap[id] = (totalShippedMap[id] || 0) + (p.quantity || 0);
      })
    );
    /* --------- CHECK IF ANY SHIPMENT IS NOT SHIPPED --------- */
    const FINAL_SHIPMENT_STATUSES = ['SHIPPED', 'DELIVERED'];

    const hasUnshippedShipment = allShipments.some((s) => !FINAL_SHIPMENT_STATUSES.includes(s.status));

    /* --------- QUANTITY BASED CHECK --------- */
    const allQtyShipped = updatedOrder.orderSkuList.skuList.every((sku) => {
      const availableQty = (sku.quantity || 0) - (sku.cancellationRequestedQuantity || 0);
      const shippedQty = totalShippedMap[String(sku.id)] || 0;
      return availableQty <= 0 || shippedQty >= availableQty;
    });

    /* --------- FINAL DECISION --------- */
    const allShipped = allQtyShipped && !hasUnshippedShipment;

    const partiallyShipped =
      !allShipped &&
      updatedOrder.orderSkuList.skuList.some((sku) => {
        const availableQty = (sku.quantity || 0) - (sku.cancellationRequestedQuantity || 0);
        const shippedQty = totalShippedMap[String(sku.id)] || 0;
        return shippedQty > 0 && shippedQty < availableQty;
      });

    if (allShipped) {
      await Order.findByIdAndUpdate(orderId, { status: 'SHIPPED' });
    } else if (partiallyShipped) {
      await Order.findByIdAndUpdate(orderId, { status: 'IN_PROGRESS' });
    }

    const updatedSkuList = updatedOrder.orderSkuList.skuList.map((sku) => {
      const availableQty = (sku.quantity || 0) - (sku.cancellationRequestedQuantity || 0);

      const shippedQty = totalShippedMap[String(sku.id)] || 0;

      const confirmedQty = Math.max(availableQty - shippedQty, 0);

      return {
        ...sku,
        statusBreakdown: {
          confirmed: confirmedQty,
          shipped: shippedQty,
          delivered: sku.statusBreakdown?.delivered ?? 0,
          returned: sku.statusBreakdown?.returned ?? 0,
          canceled: sku.statusBreakdown?.canceled ?? 0,
          shipmentCreated: sku.statusBreakdown?.shipmentCreated ?? 0,
        },
        status: shippedQty >= availableQty ? 'SHIPPED' : shippedQty > 0 ? 'IN_PROGRESS' : 'IN_PROGRESS',
      };
    });

    await Order.findByIdAndUpdate(orderId, {
      'orderSkuList.skuList': updatedSkuList,
    });

    await OrderLogs.updateOne(
      { orderId },
      {
        $push: {
          details: {
            status: allShipped ? 'SHIPPED' : 'IN_PROGRESS',
            description: allShipped ? 'All available items shipped' : 'Order partially shipped',
            createdAt: convetDateToUTC(new Date()),
          },
        },
      },
      { upsert: true }
    );

    return {
      success: true,
      message: 'Unicommerce shipment created successfully',
      shipmentId: shipment._id,
      airWaybillNo,
      merchantShipmentNo,
    };
  } catch (error) {
    console.error('createManualShipmentService error:', error);
    throw new Error(error.message || 'Failed to create Unicommerce shipment');
  }
};
export default {
  orderDispatch,
};
