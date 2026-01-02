import Return from '../models/Return.js';
import Order from '../models/Orders.js';
import Shipment from '../models/Shipment/Shipment.js';

export const handleOmnifulQCWebhook = async (webhookPayload) => {
  try {
    const {
      event_name,
      data: { id: poId, order_details },
    } = webhookPayload;

    // Validate event type
    if (event_name !== 'purchase_order.update.event') {
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
    let returnDoc = await Return.findOne({
      orderId: orderIdStr,
    });

    if (!returnDoc && order.merchantOrderNo) {
      returnDoc = await Return.findOne({
        merchantOrderNo: order.merchantOrderNo,
      });
    }

    if (!returnDoc) {
      return {
        success: false,
        message: `No return found for order ID: ${orderIdStr}. Cannot update QC details for an order without a return.`,
        statusCode: 404,
        debug: {
          shipmentId: shipment._id,
          orderId: orderIdStr,
          poId: poId.toString(),
        },
      };
    }

    // Extract QC data
    const qcData = {
      poId: poId.toString(),
      totalQuantity: order_details.quantity || 0,
      qc: {
        passed: order_details.grn_pass_quantity || 0,
        failed: order_details.grn_fail_quantity || 0,
      },
      lastUpdated: new Date(),
    };

    // Determine QC status
    let qcStatus = 'PENDING';
    if (qcData.qc.passed > 0 && qcData.qc.failed === 0) {
      qcStatus = 'ACCEPTED';
    } else if (qcData.qc.failed > 0 && qcData.qc.passed > 0) {
      qcStatus = 'PARTIAL';
    } else if (qcData.qc.failed > 0 && qcData.qc.passed === 0) {
      qcStatus = 'REJECTED';
    }
    qcData.qcStatus = qcStatus;

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
        qcStatus: qcData.qcStatus,
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

export default {
  handleOmnifulQCWebhook,
};
