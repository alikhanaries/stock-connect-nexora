import mongoose from 'mongoose';
import Shipment from '../models/Shipment/Shipment.js';
import User from '../models/User.js';
import { config } from '../config/config.js';
import Order from '#models/Orders.js';
import { createAymakanShipmentAPI, trackAymakanShipmentAPI } from './aymakanService.js';
import { buildCollectionData } from '../helpers/buildCollectionData.js';
import PickupAddress from '../models/PickUpAdress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

const SHIPMENT_MERCHANT_INFO = {
  NAME: 'Aymakan',
  EMAIL: 'deliver@aymakan.com',
};
export const createShipmentWithAymakan = async (shipmentData) => {
  try {
    const { userId, declaredValue, deliveryData, collectionData, pieces = 0 } = shipmentData;

    // --- 1Resolve requested_by from userId ---
    let requestedBy = 'Unknown';
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).lean();
      if (!user) throw new Error('User not found for requested_by');
      requestedBy = user.firstName || user.username || 'Unknown';
    }

    // ---  Helper to safely build delivery/collection info ---
    const buildPartyPayload = (data = {}, prefix) => ({
      [`${prefix}_name`]: data?.name || '',
      [`${prefix}_email`]: data?.email || '',
      [`${prefix}_city`]: data?.city || '',
      [`${prefix}_address`]: data?.address || '',
      [`${prefix}_country`]: data?.country || '',
      [`${prefix}_phone`]: data?.phone || '',
    });

    // ---  Build final payload for Aymakan ---
    const payload = {
      requested_by: requestedBy,
      declared_value: declaredValue || 0,
      cod_amount: shipmentData.codAmount || 0,
      currency: shipmentData.currency || 'SAR',
      ...buildPartyPayload(deliveryData, 'delivery'),
      ...buildPartyPayload(collectionData, 'collection'),
      pieces,
    };

    // ---  Call Aymakan API ---
    const result = await createAymakanShipmentAPI(payload);

    // ---  Validate Aymakan response ---
    if (!result?.success || !result?.shipping?.tracking_number) {
      throw new Error('Aymakan shipment creation failed');
    }

    return result;
  } catch (error) {
    console.error('Aymakan Service Error:', error.message);
    throw error;
  }
};

/**
 * Call ChannelEngine Create Shipment API
 */
export const createShipmentWithChannelEngine = async ({
  merchantShipmentNo,
  merchantOrderNo,
  lines = [],
  trackTraceNo = '',
  trackTraceUrl = '',
  returnTrackTraceNo = '',
  method = '',
  shippedFromCountryCode = 'SA',
  shipmentDate = new Date(),
  returnMethod = '',
  isMerchantCreator = true,
  airWaybillNo,
  extraData = {},
}) => {
  try {
    // Validations
    if (!merchantShipmentNo) throw new Error('merchantShipmentNo is required');
    if (!merchantOrderNo) throw new Error('merchantOrderNo is required');
    if (!Array.isArray(lines) || lines.length === 0) throw new Error('lines must be a non-empty array');
    if (!airWaybillNo) throw new Error('airWaybillNo is required');

    // Map lines to ChannelEngine format
    const mappedLines = lines.map((line) => ({
      MerchantProductNo: line.merchantProductNo || line.sku || 'UNKNOWN',
      OrderLineId: line.orderLineId || 0,
      ExtraData: line.extraData || { additionalProp1: '', additionalProp2: '', additionalProp3: '' },
      Quantity: line.quantity || 0,
    }));

    const payload = {
      MerchantShipmentNo: merchantShipmentNo,
      MerchantOrderNo: merchantOrderNo,
      Lines: mappedLines,
      ExtraData: extraData || { additionalProp1: '', additionalProp2: '', additionalProp3: '' },
      TrackTraceNo: trackTraceNo,
      TrackTraceUrl: trackTraceUrl,
      ReturnTrackTraceNo: returnTrackTraceNo,
      Method: method,
      ShippedFromCountryCode: shippedFromCountryCode,
      ShipmentDate: shipmentDate instanceof Date ? shipmentDate.toISOString() : shipmentDate,
      ReturnMethod: returnMethod,
      IsMerchantCreator: isMerchantCreator,
      AirWaybillNo: airWaybillNo,
    };
    console.log(payload);
    const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`;

    const response = await fetch(ceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();

      throw new Error(errorData?.Message);
    }

    const result = await response.json();

    return result;
  } catch (error) {
    console.error('Error in createShipmentWithChannelEngine:', error.message);
    throw error;
  }
};

// export const createShipmentService = async (shipmentData) => {
//   try {
//     const { id, sellerId, userId, delivery, collection, shippedFromCountryCode } = shipmentData;

//     // Validate required fields early
//     if (!orderId || !sellerId || !userId || !delivery || !collection) {
//       throw new Error('Missing required shipment fields');
//     }
//     // Fetch order details

//     const orderDetails = await Order.findById(id).lean();

//     if (!orderDetails) {
//       return { success: false, message: 'Order not found.' };
//     }

//     const { orderSkuList, merchantOrderNo, orderId } = orderDetails;
//     console.log('orderDetails', orderDetails);
//     // Validate SKU list
//     if (!orderSkuList?.skuList || orderSkuList.skuList.length === 0) {
//       return { success: false, message: 'Order has empty line items.' };
//     }

//     const { skuList } = orderSkuList;
//     // Resolve or create delivery & collection
//   const deliveryData = await getDeliveryAddress(delivery);
//     if (!deliveryData) throw new Error('Invalid delivery information');
//     const collectionData = await getPickUpAddress(orderDetails);
//     if (!collectionData) throw new Error('Invalid collection information');

//     // Call Aymakan API
//     const aymakanResult = await createShipmentWithAymakan({
//       ...shipmentData,
//       deliveryData: deliveryData,
//       collectionData: collectionData,
//       pieces: skuList.length,
//     });

//     const trackingNumber = aymakanResult.shipping.tracking_number;
//     if (!aymakanResult?.success) {
//       return { success: false, message: 'Shipment by Aymakan having error' };
//     }

//     //  Transform into skuList
//     const finalSkuList = skuList.map((line) => ({
//       merchantProductNo: line.merchantProductNo,
//       orderLineId: line.id,
//       quantity: line.quantity,
//     }));

//     const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;

//     // Call ChannelEngine API
//     const channelResult = await createShipmentWithChannelEngine({
//       merchantShipmentNo: merchantShipmentNo,
//       merchantOrderNo: merchantOrderNo,
//       lines: finalSkuList,
//       trackTraceNo: aymakanResult.shipping.tracking_number,
//       trackTraceUrl: '',
//       returnTrackTraceNo: '',
//       method: '',
//       shippedFromCountryCode: shippedFromCountryCode || 'SA',
//       shipmentDate: new Date(),
//       returnMethod: '',
//       isMerchantCreator: true,
//       airWaybillNo: trackingNumber,
//       extraData: {},
//     });

//     if (!channelResult?.Success) {
//       return { success: false, message: 'Channel engine error' };
//     }
//     // Assuming skuList is an array from orderSkuList.skuList
//     const lines = skuList?.map((sku, index) => ({
//       id: sku.orderLineId || index + 1, // fallback to index if orderLineId missing
//       status: sku.status || 'PENDING',
//       stockLocation: {
//         Id: sku.stockLocationId || 1, // default warehouse ID
//         Name: sku.stockLocationName || 'Default Warehouse',
//       },
//       channelProductNo: sku.channelProductNo || '',
//       merchantProductNo: sku.merchantProductNo || sku.sku || '',
//       quantity: sku.quantity || 1,
//       orderLineId: sku?.id,
//     }));

//     const aymakanTrackingResult = await trackAymakanShipmentAPI(trackingNumber);
//     const trackingInfo =
//       aymakanTrackingResult?.trackingInfo?.map((info) => ({
//         statusCode: info.status_code,
//         description: info.description,
//         descriptionAr: info.description_ar,
//         reasonCode: info.reason_code,
//         reasonEn: info.reason_en,
//         reasonAr: info.reason_ar,
//         createdAt: info.created_at,
//       })) || [];
//     const shpmentData = {
//       orderId: new mongoose.Types.ObjectId(id),
//       sellerId: new mongoose.Types.ObjectId(sellerId),
//       userId: new mongoose.Types.ObjectId(userId),
//       delivery: deliveryData?._id,
//       collection: collectionData?._id,
//       airWaybillNo: trackingNumber,
//       merchantShipmentNo: merchantShipmentNo,
//       merchantOrderNo: merchantOrderNo,
//       status: 'PENDING',
//       trackingInfo: trackingInfo,
//       lines: lines,
//       extraData: {
//         aymakan: aymakanResult,
//         channelEngine: channelResult,
//       },
//       shipmentMerchantDetails: {
//         name: SHIPMENT_MERCHANT_INFO.NAME,
//         email: SHIPMENT_MERCHANT_INFO.EMAIL,
//       },
//     };

//     // Save shipment in MongoDB
//     const shipment = new Shipment(shpmentData);

//     await shipment.save();

//     return {
//       shipmentId: shipment?._id,
//     };
//   } catch (error) {
//     console.error('Error in createShipmentService:', error.message);
//     throw error;
//   }
// };

export const getPickUpAddress = async (pickUpId) => {
  try {
    const collectionData = await PickupAddress.findById(pickUpId);

    return collectionData || false;
  } catch (error) {
    console.error('Error in getPickUpAddress:', error.message);
    throw new Error(error.message);
  }
};
export const saveDeliveryAddress = async (data) => {
  try {
    const deliveryData = {
      ...data,
    };

    // Save shipment in MongoDB
    const delivery = new DeliveryAddress(deliveryData);

    const result = await delivery.save();
    return result;
  } catch (error) {
    console.error('Error in saveDeliveryAddress:', error.message);
    throw new Error(error.message);
  }
};

export const createPartialShipmentService = async (shipmentData) => {
  try {
    const { id, sellerId, userId, pickUpId, shippedFromCountryCode, products } = shipmentData;
    console.log('shipmentData', shipmentData);
    // Validate required fields early
    if (!id || !sellerId || !userId || !pickUpId || !products) {
      throw new Error('Missing required shipment fields');
    }
    // Fetch order details

    const orderDetails = await Order.findById(id).lean();

    if (!orderDetails) {
      return { success: false, message: 'Order not found.' };
    }
    // Fetch seller pick up address details
    console.log('orderDetails', orderDetails);

    const { orderSkuList, merchantOrderNo, orderId } = orderDetails;

    // Validate SKU list
    if (!orderSkuList?.skuList || orderSkuList.skuList.length === 0) {
      return { success: false, message: 'Order has empty line items.' };
    }

    const { skuList } = orderSkuList;
    // Resolve or create delivery & collection
    const deliveryData = await buildCollectionData(orderDetails?.orderShippingAddress, orderDetails?.orderCustomer);
    console.log('deliveryData', deliveryData);
    if (!deliveryData) throw new Error('Invalid delivery information');
    const deliveryDetails = await saveDeliveryAddress(deliveryData);
    console.log('deliveryDetails-----------', deliveryDetails);
    const collectionData = await getPickUpAddress(pickUpId);
    console.log('collectionData', collectionData);
    if (!collectionData) throw new Error('Invalid pickup information');

    // Call Aymakan API
    const aymakanResult = await createShipmentWithAymakan({
      ...shipmentData,
      deliveryData: deliveryData,
      collectionData: collectionData,
      pieces: products.length,
    });

    const trackingNumber = aymakanResult.shipping.tracking_number;
    if (!aymakanResult?.success) {
      return { success: false, message: 'Shipment by Aymakan having error' };
    }

    const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;
    // Call ChannelEngine API
    const channelResult = await createShipmentWithChannelEngine({
      merchantShipmentNo: merchantShipmentNo,
      merchantOrderNo: merchantOrderNo,
      lines: products,
      trackTraceNo: aymakanResult.shipping.tracking_number,
      trackTraceUrl: '',
      returnTrackTraceNo: '',
      method: '',
      shippedFromCountryCode: shippedFromCountryCode || 'SA',
      shipmentDate: new Date(),
      returnMethod: '',
      isMerchantCreator: true,
      airWaybillNo: trackingNumber,
      extraData: {},
    });

    if (!channelResult?.Success) {
      return { success: false, message: 'Channel engine error' };
    }
    // Assuming skuList is an array from orderSkuList.skuList
    const lines = skuList?.map((sku, index) => ({
      id: sku.orderLineId || index + 1, // fallback to index if orderLineId missing
      status: sku.status || 'PENDING',
      stockLocation: {
        Id: sku.stockLocationId || 1, // default warehouse ID
        Name: sku.stockLocationName || 'Default Warehouse',
      },
      channelProductNo: sku.channelProductNo || '',
      merchantProductNo: sku.merchantProductNo || sku.sku || '',
      quantity: sku.quantity || 1,
      orderLineId: sku?.id,
    }));

    const aymakanTrackingResult = await trackAymakanShipmentAPI(trackingNumber);
    const trackingInfo =
      aymakanTrackingResult?.trackingInfo?.map((info) => ({
        statusCode: info.status_code,
        description: info.description,
        descriptionAr: info.description_ar,
        reasonCode: info.reason_code,
        reasonEn: info.reason_en,
        reasonAr: info.reason_ar,
        createdAt: info.created_at,
      })) || [];
    const isFullShipment = products.length === orderSkuList.skuList.length;
    const shpmentData = {
      orderId: new mongoose.Types.ObjectId(id),
      sellerId: new mongoose.Types.ObjectId(sellerId),
      userId: new mongoose.Types.ObjectId(userId),
      deliveryId: deliveryDetails?._id,
      pickUpId: collectionData?._id,
      airWaybillNo: trackingNumber,
      merchantShipmentNo: merchantShipmentNo,
      merchantOrderNo: merchantOrderNo,
      status: 'PENDING',
      trackingInfo: trackingInfo,
      lines: lines,
      extraData: {
        aymakan: aymakanResult,
        channelEngine: channelResult,
      },
      shipmentMerchantDetails: {
        name: SHIPMENT_MERCHANT_INFO.NAME,
        email: SHIPMENT_MERCHANT_INFO.EMAIL,
      },
      isFullShipment,
    };

    // Save shipment in MongoDB
    const shipment = new Shipment(shpmentData);

    await shipment.save();
    return { success: true, shipmentId: shipment?._id };
  } catch (error) {
    console.error('Error in createShipmentService:', error.message);
    throw error;
  }
};
