import mongoose from 'mongoose';
import Shipment from '../models/Shipment/Shipment.js';
import User from '../models/User.js';
import { config } from '../config/config.js';
import Order from '#models/Orders.js';
import { createAymakanShipment, trackAymakanShipment } from './aymakanService.js';
import { formatShipmentDeliveryAddress } from '../helpers/formatShipmentDeliveryAddress.js';
import PickupAddress from '../models/PickUpAddress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { getPagination } from '#helpers/PaginationHandler.js';
import { AYMAKAN_STATUS, AYMAKAN_INFO } from '#util/ayMakanData.js';

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
    const result = await createAymakanShipment(payload);

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
  method = 'Aymakan',
  shippedFromCountryCode = 'SA',
  shipmentDate = new Date(),
  returnMethod = '',
  isMerchantCreator = true,
  airWaybillNo,
  extraData = {},
}) => {
  try {
    // Basic validations
    if (!merchantShipmentNo) throw new Error('merchantShipmentNo is required');
    if (!merchantOrderNo) throw new Error('merchantOrderNo is required');
    if (!Array.isArray(lines) || lines.length === 0) throw new Error('lines must be a non-empty array');
    if (!airWaybillNo) throw new Error('airWaybillNo is required');

    // Normalize and map lines
    const mappedLines = lines.map((line, i) => ({
      MerchantProductNo: line.merchantProductNo || line.sku || `UNKNOWN-${i}`,
      OrderLineId: line.orderLineId || 0,
      Quantity: line.quantity || 1,
      ExtraData: line.extraData || { additionalProp1: '', additionalProp2: '', additionalProp3: '' },
    }));

    // Build ChannelEngine payload
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
      ShipmentDate: shipmentDate,
      ReturnMethod: returnMethod,
      IsMerchantCreator: isMerchantCreator,
      AirWaybillNo: airWaybillNo,
    };

    const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`;

    // Add one retry for transient network errors
    let response;
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(ceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) break;

      if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
    }

    // Handle failed response
    if (!response.ok) {
      let message = `Failed to create shipment for ${merchantShipmentNo} (${response.status})`;
      try {
        const errorData = await response.json();
        message = errorData?.Message || message;
        console.log(message);
      } catch {
        // ignore parse errors
      }
      //throw new Error(message);
    }

    const result = await response.json();

    return { success: true, message: 'Shipment created successfully', data: result };
  } catch (error) {
    console.error(`Error in createShipmentWithChannelEngine for ${merchantShipmentNo}:`, error.message);
    //throw error;
    return { success: false, message: 'Shipment created failed' };
  }
};

/**
 * Call Update delivery state of ChannelEngine API
 */
export const updateShipmentDeliveryStateChannelEngine = async (status, deliveryDate, merchantShipmentNo) => {
  try {
    // Validate inputs
    if (!merchantShipmentNo) throw new Error('merchantShipmentNo is required');
    if (!status) throw new Error('status is required');
    if (!deliveryDate) throw new Error('deliveryDate is required');

    const payload = {
      Status: status,
      DeliveredAt: deliveryDate || new Date(),
    };

    const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments/${merchantShipmentNo}/delivery-state?apikey=${CHANNEL_ENGINE_API_KEY}`;

    // Attempt request with one retry if transient failure
    let response;
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(ceUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) break;

      // Delay before retry (only for first attempt)
      if (attempt === 1) await new Promise((res) => setTimeout(res, 1000));
    }

    // Handle non-OK responses safely
    if (!response.ok) {
      let errorMessage = `Failed to update delivery state for ${merchantShipmentNo} (${response.status})`;

      try {
        const errorData = await response.json();

        errorMessage = errorData?.Message || errorMessage;
      } catch {
        // JSON parse failed, leave as default
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`Error in updateShipmentDeliveryStateChannelEngine for ${merchantShipmentNo}:`, error.message);
    throw error;
  }
};

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
    const { id, sellerId, userId, pickUpId, products = [], pieces = 0 } = shipmentData;

    // Collect missing fields
    const missingFields = [];
    if (!id) missingFields.push('id');
    if (!sellerId) missingFields.push('sellerId');
    if (!userId) missingFields.push('userId');
    if (!pickUpId) missingFields.push('pickUpId');
    if (!products || products.length === 0) missingFields.push('products');

    // Throw error if any fields are missing
    if (missingFields.length > 0) {
      throw new Error(`Missing required shipment fields: ${missingFields.join(', ')}`);
    }

    // Fetch order as a Mongoose document (no .lean()

    const order = await Order.findById(id);

    if (!order) {
      return { success: false, message: 'Order not found.' };
    }

    const { orderSkuList, merchantOrderNo, orderId } = order;

    // Validate SKU list
    if (!orderSkuList?.skuList || orderSkuList.skuList.length === 0) {
      return { success: false, message: 'Order has empty line items.' };
    }

    // Check if shipment already exists for any of the selected SKUs
    const productLineIds = products.map((p) => p.orderLineId?.toString());
    const existingShipments = await Shipment.find({
      orderId: id,
      status: { $ne: 'CANCELED' }, // only consider non-canceled shipments
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    if (existingShipments?.length > 0) {
      const alreadyShippedIds = [
        ...new Set(
          existingShipments.flatMap((s) =>
            s.products.filter((p) => productLineIds.includes(p.orderLineId?.toString())).map((p) => p.orderLineId)
          )
        ),
      ];

      return {
        success: false,
        message: `Shipment already created for products: ${alreadyShippedIds.join(', ')}`,
      };
    }

    // Resolve or create delivery & collection
    const deliveryData = await formatShipmentDeliveryAddress(order.orderShippingAddress, order.orderCustomer);
    if (!deliveryData) throw new Error('Invalid delivery information');
    const deliveryDetails = await saveDeliveryAddress(deliveryData);

    const collectionData = await getPickUpAddress(pickUpId);
    if (!collectionData) throw new Error('Invalid pickup information');

    // Call Aymakan API
    const aymakanResult = await createShipmentWithAymakan({
      ...shipmentData,
      deliveryData,
      collectionData,
      pieces,
    });

    if (!aymakanResult?.success) {
      return { success: false, message: 'Shipment by Aymakan encountered an error' };
    }

    const trackingNumber = aymakanResult.shipping.tracking_number;

    const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;

    // Track shipment for status info
    const aymakanTrackingResult = await trackAymakanShipment(trackingNumber);
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

    // Prepare shipment document
    const shipmentDocument = new Shipment({
      orderId: new mongoose.Types.ObjectId(id),
      sellerId: new mongoose.Types.ObjectId(sellerId),
      userId: new mongoose.Types.ObjectId(userId),
      deliveryId: deliveryDetails?._id,
      pickUpId: collectionData?._id,
      airWaybillNo: trackingNumber,
      merchantShipmentNo,
      merchantOrderNo,
      status: AYMAKAN_STATUS.AY_0001,
      trackingInfo,
      products,
      extraData: {
        aymakan: aymakanResult,
      },
      shipmentMerchantDetails: {
        name: AYMAKAN_INFO.NAME,
        email: AYMAKAN_INFO.EMAIL,
      },
      pieces,
    });

    // Save shipment
    await shipmentDocument.save();

    // Update all matching SKUs in order
    for (const product of products) {
      const sku = order.orderSkuList.skuList.find((s) => s.id === product.orderLineId);
      if (sku) {
        sku.airWaybillNo = trackingNumber;
      }
    }
    if (!order?.sellerId) {
      order['sellerId'] = sellerId;
    }
    await order.save();

    return { success: true, shipmentId: shipmentDocument._id };
  } catch (error) {
    console.error('Error in createPartialShipmentService:', error);
    throw error;
  }
};

export const getAllShipmentsService = async ({ page = 1, size = 10, sellerId, status, search }) => {
  try {
    const currentPage = parseInt(page);
    const perPage = parseInt(size);
    const skip = (currentPage - 1) * perPage;

    const matchStage = {
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    // Applied filters object
    const appliedFilters = {};
    if (status) {
      matchStage.status = status.toUpperCase();
      appliedFilters.status = status;
    }
    // Aggregation pipeline
    const aggregationPipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'deliveryaddresses',
          localField: 'deliveryId',
          foreignField: '_id',
          as: 'deliveryInfo',
        },
      },
      { $unwind: { path: '$deliveryInfo', preserveNullAndEmptyArrays: true } },
    ];

    // Build OR search conditions
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i'); // case-insensitive search

      const orConditions = [
        { 'shipmentMerchantDetails.name': { $regex: searchRegex } },
        { 'shipmentMerchantDetails.email': { $regex: searchRegex } },
        { 'deliveryInfo.name': { $regex: searchRegex } },
        { 'deliveryInfo.email': { $regex: searchRegex } },
        { airWaybillNo: { $regex: searchRegex } },
        { status: { $regex: searchRegex } },
      ];

      aggregationPipeline.push({ $match: { $or: orConditions } });
    }

    aggregationPipeline.push(
      {
        $project: {
          orderId: 1,
          createdAt: '$createdAt',
          status: 1,
          airWaybillNo: 1,
          sellerId: 1,
          shipmentMerchantDetails: 1,
          deliveryCustomer: {
            name: { $ifNull: ['$deliveryInfo.name', '$shipmentMerchantDetails.name'] },
            email: { $ifNull: ['$deliveryInfo.email', '$shipmentMerchantDetails.email'] },
          },
        },
      },
      { $sort: { createdAt: -1 } }, // latest first
      { $skip: skip }, // skip for pagination
      { $limit: perPage } // limit for pagination
    );

    const shipmentData = await Shipment.aggregate(aggregationPipeline);

    // Total count with same filters (without skip/limit)
    const totalCountMatch = { ...matchStage };
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      totalCountMatch.$or = [
        { 'shipmentMerchantDetails.name': { $regex: searchRegex } },
        { 'shipmentMerchantDetails.email': { $regex: searchRegex } },
        { 'deliveryInfo.name': { $regex: searchRegex } },
        { 'deliveryInfo.email': { $regex: searchRegex } },
        { airWaybillNo: { $regex: searchRegex } },
        { status: { $regex: searchRegex } },
      ];
    }
    const total = await Shipment.countDocuments(totalCountMatch);

    return {
      shipments: shipmentData,
      pagination: getPagination(total, currentPage, perPage),
      appliedFilters,
    };
  } catch (error) {
    console.error('Error fetching shipments:', error);
    throw new Error('Failed to fetch shipments');
  }
};

export const ayMakanWebHookService = async (data) => {
  try {
    if (!data?.tracking_number) {
      return { success: false, message: 'Missing tracking_number in webhook payload' };
    }

    const shipmentData = await Shipment.findOne(
      { airWaybillNo: data.tracking_number },
      {
        _id: 1,
        merchantShipmentNo: 1,
        merchantOrderNo: 1,
        products: 1,
        airWaybillNo: 1,
        status: 1, // needed for duplicate status check
        orderId: 1,
      }
    ).lean();

    if (!shipmentData) {
      return { success: false, message: `Shipment not found for AWB: ${data.tracking_number}` };
    }
    const statusCode = data.status; //AY-0002

    const shipmentStatus = AYMAKAN_STATUS[statusCode]?.status;

    // Duplicate check (case-insensitive)
    if ((shipmentData.status || '').toUpperCase() === shipmentStatus) {
      return { success: true, message: 'Duplicate webhook ignored', shipmentId: shipmentData._id };
    }

    // 1. When shipment is picked
    if (shipmentStatus === 'PICKED') {
      const payload = {
        merchantShipmentNo: shipmentData.merchantShipmentNo,
        merchantOrderNo: shipmentData.merchantOrderNo,
        lines: shipmentData.products || [],
        extraData: {},
        trackTraceNo: shipmentData.airWaybillNo,
        trackTraceUrl: '',
        returnTrackTraceNo: '',
        method: 'Aymakan',
        shippedFromCountryCode: data.delivery_country,
        shipmentDate: data.date_time,
        returnMethod: '',
        isMerchantCreator: true,
        airWaybillNo: shipmentData.airWaybillNo,
      };

      try {
        await createShipmentWithChannelEngine(payload);
      } catch (err) {
        console.error('Error creating shipment in ChannelEngine:', err.message);
      }
    }

    // 2. When shipment is delivered
    if (shipmentStatus === 'DELIVERED') {
      try {
        await updateShipmentDeliveryStateChannelEngine('DELIVERED', data.date_time, shipmentData.merchantShipmentNo);
      } catch (err) {
        console.error('Error updating delivery state in ChannelEngine:', err.message);
      }
    }

    // 3. Update local shipment record
    const trackingInfo =
      Array.isArray(data.tracking_info) && data.tracking_info.length > 0
        ? data.tracking_info.map((info) => ({
            statusCode: info.status_code,
            description: info.description,
            descriptionAr: info.description_ar,
            reasonCode: info.reason_code,
            reasonEn: info.reason_en,
            reasonAr: info.reason_ar,
            createdAt: info.created_at,
          }))
        : [];
    // UPDATE SHIPMENT STATUS
    console.log('shipmentStatus------', shipmentStatus);
    const updatedShipment = await Shipment.findOneAndUpdate(
      { _id: shipmentData._id },
      {
        status: shipmentStatus?.toUpperCase(),
        trackingInfo,
      },
      { new: true }
    );
    // UPDATE ORDER STATUS
    const orderLineIdsToUpdate = shipmentData.products.map((p) => p.orderLineId);

    await Order.findOneAndUpdate(
      { _id: shipmentData?.orderId },
      {
        $set: {
          status: shipmentStatus?.toUpperCase(),
          'orderSkuList.skuList.$[sku].status': shipmentStatus?.toUpperCase(),
        },
      },
      {
        arrayFilters: [{ 'sku.id': { $in: orderLineIdsToUpdate } }],
        new: false, // returns the document before update
      }
    );
    return {
      success: true,
      message: `Shipment ${data.tracking_number} updated successfully (${data.status_label})`,
      shipmentId: updatedShipment._id,
    };
  } catch (error) {
    console.error(' Error in ayMakanWebHookService:', error.message, error.stack);
    throw new Error('Failed to process AyMakan webhook: ' + error.message);
  }
};

export default {
  ayMakanWebHookService,
  getAllShipmentsService,
  createPartialShipmentService,
  saveDeliveryAddress,
  getPickUpAddress,
  updateShipmentDeliveryStateChannelEngine,
  createShipmentWithChannelEngine,
  createShipmentWithAymakan,
};
