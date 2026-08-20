import Return from '../models/Return.js';
import OrderLogs from '#models/OrderLogs.js';
import Order from '../models/Orders.js';
import Shipment from '../models/Shipment/Shipment.js';
import forwardShipmentService from './forwardShipmentService.js';
import { updateOrderSkuStatusToShipped } from '#root/src/service/orderService.js';
import { syncSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';
import { convetDateToUTC } from '#root/src/helpers/Common.js';

export const OMNIFUL_PO_UPDATE_EVENT = 'purchase_order.update.event';
export const OMNIFUL_PO_READY_TO_SHIP_STATUS = 'ready_to_ship';

const pushOrderLogEntries = async (orderId, sellerId, entries) => {
  if (!orderId || !sellerId || !entries?.length) return;

  await OrderLogs.updateOne(
    { orderId, sellerId },
    {
      $push: { details: { $each: entries } },
      $setOnInsert: { orderId, sellerId },
    },
    { upsert: true }
  );
};

const buildOrderLogEntry = (description, status = 'IN_PROGRESS') => ({
  status,
  shippedQty: 0,
  deliveredQty: 0,
  canceledQty: 0,
  description,
  createdAt: convetDateToUTC(new Date()),
});

export const handleOmnifulQCWebhook = async (webhookPayload) => {
  try {
    const {
      event_name,
      data: { id: poId, order_details },
    } = webhookPayload;

    // Validate event type
    if (event_name !== OMNIFUL_PO_UPDATE_EVENT) {
      return {
        success: false,
        message: 'Invalid event type. Expected: purchase_order.update.event',
        statusCode: 400,
      };
    }

    // Validate required fields
    if (!poId) {
      return {
        success: false,
        message: 'Missing required field: id',
        statusCode: 400,
      };
    }

    if (!order_details) {
      return {
        success: false,
        message: 'Missing required field: order_details',
        statusCode: 400,
      };
    }

    // Find shipment by purchase_order_id in extraData.omniful
    const shipment = await Shipment.findOne({
      'extraData.omniful.purchase_order_id': poId.toString(),
    })
      .select('_id orderId extraData')
      .lean();

    if (!shipment) {
      return {
        success: false,
        message: `No shipment found for purchase order ID: ${poId}`,
        statusCode: 404,
      };
    }

    // Validate that shipment has a valid orderId
    if (!shipment.orderId) {
      return {
        success: false,
        message: `Shipment found but has no associated order ID`,
        statusCode: 400,
      };
    }

    const orderIdStr = shipment.orderId.toString();

    // Validate that order exists
    const order = await Order.findById(shipment.orderId).select('merchantOrderNo').lean();
    if (!order) {
      return {
        success: false,
        message: `Order not found for ID: ${orderIdStr}`,
        statusCode: 404,
      };
    }

    // Validate return exists before processing QC data
    const returnDoc = await Return.findOne({
      merchantOrderNo: order.merchantOrderNo,
    });

    if (!returnDoc) {
      return {
        success: false,
        message: `No return found for merchantOrderNo: ${order.merchantOrderNo}. Cannot update QC details for an order without a return.`,
        statusCode: 404,
        debug: {
          shipmentId: shipment._id,
          orderId: orderIdStr,
          merchantOrderNo: order.merchantOrderNo,
          poId: poId.toString(),
        },
      };
    }

    // Extract QC data
    const qcData = {
      poId: poId.toString(),
      totalQuantity: order_details.quantity || 0,
      passed: order_details.grn_pass_quantity || 0,
      failed: order_details.grn_fail_quantity || 0,
      status: webhookPayload.data.status || 'NA',
      remark: webhookPayload.data.remark || 'NA',
      lastUpdated: new Date(),
    };

    // Update return with QC data
    returnDoc.omniful = qcData;
    await returnDoc.save();

    console.log('QC data updated successfully for return:', returnDoc._id);

    return {
      success: true,
      message: 'QC details updated successfully',
      data: {
        returnId: returnDoc._id,
        merchantReturnNo: returnDoc.merchantReturnNo,
        orderId: shipment.orderId,
        shipmentId: shipment._id,
        poId: poId.toString(),
        qcData,
      },
    };
  } catch (error) {
    console.error('Error in handleOmnifulQCWebhook:', error.message);
    return {
      success: false,
      message: 'Error processing Omniful QC webhook',
      error: error.message,
      statusCode: 500,
    };
  }
};

/**
 * Handle OmniFul Purchase Order status webhooks for forward Saudi warehouse flow.
 * On ready_to_ship: update shipment, create ChannelEngine shipment once (idempotent).
 *
 * @param {object} webhookPayload
 * @param {object} [options] - Test doubles only
 */
export const handleOmnifulPurchaseOrderReadyToShip = async (webhookPayload, options = {}) => {
  const ShipmentModel = options.ShipmentModel ?? Shipment;
  const createCeShipment = options.createCeShipment ?? forwardShipmentService.createShipmentwithCE;
  const syncOrderSkus = options.syncOrderSkus ?? updateOrderSkuStatusToShipped;
  const syncSellerOrders = options.syncSellerOrders ?? syncSellerOrdersFromOrder;
  const pushLogs = options.pushOrderLogEntries ?? pushOrderLogEntries;

  try {
    const { event_name, data } = webhookPayload ?? {};

    if (event_name !== OMNIFUL_PO_UPDATE_EVENT) {
      return {
        success: false,
        message: `Invalid event type. Expected: ${OMNIFUL_PO_UPDATE_EVENT}`,
        statusCode: 400,
      };
    }

    if (!data?.id) {
      return {
        success: false,
        message: 'Missing required field: id',
        statusCode: 400,
      };
    }

    if (!data?.status) {
      return {
        success: false,
        message: 'Missing required field: status',
        statusCode: 400,
      };
    }

    const poId = data.id.toString();
    const omnifulStatusCode = data.status;
    const awbNumber = data?.shipment?.awb_number || data?.awb_number || null;

    const shipment = await ShipmentModel.findOne({
      'extraData.omniful.purchase_order_id': poId,
    }).lean();

    if (!shipment) {
      return {
        success: false,
        message: `No shipment found for purchase order ID: ${poId}`,
        statusCode: 404,
      };
    }

    const logEntries = [
      buildOrderLogEntry(`OmniFul Purchase Order ${poId} status update received: ${omnifulStatusCode}`),
    ];

    const updateFields = {
      'omniful.statusCode': omnifulStatusCode,
      updatedAt: new Date(),
    };

    if (awbNumber) {
      updateFields['omniful.trackingNo'] = awbNumber;
    }

    let ceShipmentCreated = false;
    let duplicateSkipped = false;

    if (omnifulStatusCode === OMNIFUL_PO_READY_TO_SHIP_STATUS) {
      logEntries.push(buildOrderLogEntry(`OmniFul Purchase Order ${poId} is Ready to Ship`));

      updateFields.status = 'OUT_FOR_DELIVERY';

      const alreadyCreated = shipment.extraData?.omniful?.ce_shipment_created === true;

      if (alreadyCreated) {
        duplicateSkipped = true;
        logEntries.push(
          buildOrderLogEntry(
            `Duplicate OmniFul Ready to Ship webhook ignored for PO ${poId}; ChannelEngine shipment already created`
          )
        );
        await ShipmentModel.updateOne({ _id: shipment._id }, { $set: updateFields });
      } else {
        const shipmentData = await ShipmentModel.findOneAndUpdate(
          { _id: shipment._id },
          { $set: updateFields },
          { new: true }
        ).lean();

        if (!shipmentData) {
          return {
            success: false,
            message: `Shipment not found after update for purchase order ID: ${poId}`,
            statusCode: 404,
          };
        }

        await syncOrderSkus(shipmentData);
        await createCeShipment(shipmentData);

        const ceCreatedAt = new Date();
        await ShipmentModel.updateOne(
          { _id: shipment._id },
          {
            $set: {
              'extraData.omniful.ce_shipment_created': true,
              'extraData.omniful.ce_shipment_created_at': ceCreatedAt,
            },
          }
        );

        ceShipmentCreated = true;
        logEntries.push(
          buildOrderLogEntry(
            `ChannelEngine shipment created for OmniFul Purchase Order ${poId}${
              awbNumber ? ` with tracking ${awbNumber}` : ''
            }`,
            'SHIPMENT_SHIPPED'
          )
        );

        await syncSellerOrders(shipmentData.orderId);

        await pushLogs(shipmentData.orderId, shipmentData.sellerId, logEntries);

        return {
          success: true,
          message: 'Purchase order ready to ship processed',
          data: {
            shipmentId: shipment._id,
            purchaseOrderId: poId,
            omnifulStatusCode,
            omnifulAwbNumber: awbNumber,
            ceShipmentCreated: true,
            duplicateSkipped: false,
          },
        };
      }
    } else {
      await ShipmentModel.updateOne({ _id: shipment._id }, { $set: updateFields });
    }

    await pushLogs(shipment.orderId, shipment.sellerId, logEntries);
    await syncSellerOrders(shipment.orderId);

    return {
      success: true,
      message: duplicateSkipped ? 'Duplicate ready to ship webhook ignored' : 'Purchase order status updated',
      data: {
        shipmentId: shipment._id,
        purchaseOrderId: poId,
        omnifulStatusCode,
        omnifulAwbNumber: awbNumber,
        ceShipmentCreated,
        duplicateSkipped,
      },
    };
  } catch (error) {
    console.error('Error in handleOmnifulPurchaseOrderReadyToShip:', error.message);
    return {
      success: false,
      message: error.message || 'Error processing Omniful purchase order webhook',
      statusCode: 500,
    };
  }
};

export const handleOmnifulOrdersWebhook = async (payload) => {
  try {
    const { data } = payload;

    if (!data?.order_id || !data?.order_status) {
      return {
        success: false,
        message: 'Missing order_id or order_status',
        statusCode: 400,
      };
    }
    const shipmentId = data.order_id;
    const omnifulStatusCode = data.order_status;
    const awbNumber = data?.shipment?.awb_number;
    await Shipment.updateOne(
      {
        _id: shipmentId,
      },
      {
        $set: {
          'omniful.statusCode': omnifulStatusCode,
          updatedAt: new Date(),
        },
      }
    );

    const updateFields = {
      'omniful.statusCode': omnifulStatusCode,
      updatedAt: new Date(),
    };

    let shouldSyncOrder = false;

    if (omnifulStatusCode === 'ready_to_ship' && awbNumber) {
      updateFields['omniful.trackingNo'] = awbNumber;
      updateFields.status = 'OUT_FOR_DELIVERY';
      shouldSyncOrder = true;
    }

    const shipmentData = await Shipment.findOneAndUpdate(
      { _id: shipmentId },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!shipmentData) {
      throw new Error('OrderId does not exist');
    }

    if (shouldSyncOrder) {
      await updateOrderSkuStatusToShipped(shipmentData);
    }

    if (omnifulStatusCode === 'ready_to_ship') {
      const omnifulAwbNumber = data?.shipment?.awb_number;
      if (omnifulAwbNumber) {
        await Shipment.findByIdAndUpdate(shipmentData._id, { 'omniful.trackingNo': omnifulAwbNumber });
      }
      await forwardShipmentService.createShipmentwithCE(shipmentData);

      await OrderLogs.updateOne(
        {
          orderId: shipmentData?.orderId,
          sellerId: shipmentData?.sellerId,
        },
        {
          $push: {
            details: {
              status: 'SHIPMENT_SHIPPED',
              description: `Shipment with Omniful Tracking Id - ${awbNumber} has been shipped`,
              createdAt: convetDateToUTC(new Date()),
            },
          },
          $setOnInsert: {
            orderId: shipmentData?.orderId,
            sellerId: shipmentData?.sellerId,
          },
        },
        { upsert: true }
      );
    }

    await syncSellerOrdersFromOrder(shipmentData?.orderId);

    return {
      success: true,
      message: 'Shipment updated',
      data: {
        shipmentId,
        omnifulStatusCode: omnifulStatusCode,
        omnifulAwbNumber: data?.shipment?.awb_number,
      },
    };
  } catch (error) {
    console.error('Service Error:', error);

    return {
      success: false,
      message: error.message,
      statusCode: 500,
    };
  }
};

export default {
  handleOmnifulQCWebhook,
  handleOmnifulPurchaseOrderReadyToShip,
  handleOmnifulOrdersWebhook,
};
