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

    // Call ChannelEngine API
    const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;
    const channelResult = await createShipmentWithChannelEngine({
      merchantShipmentNo,
      merchantOrderNo,
      lines: products,
      trackTraceNo: trackingNumber,
      trackTraceUrl: '',
      returnTrackTraceNo: '',
      method: '',
      shippedFromCountryCode: collectionData?.country || 'SA',
      shipmentDate: new Date(),
      returnMethod: '',
      isMerchantCreator: true,
      airWaybillNo: trackingNumber,
      extraData: {},
    });

    if (!channelResult?.Success) {
      return { success: false, message: 'Channel engine error' };
    }

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

    const isFullShipment = products.length === orderSkuList.skuList.length;

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
      status: 'PENDING',
      trackingInfo,
      products,
      extraData: {
        aymakan: aymakanResult,
        channelEngine: channelResult,
      },
      shipmentMerchantDetails: {
        name: SHIPMENT_MERCHANT_INFO.NAME,
        email: SHIPMENT_MERCHANT_INFO.EMAIL,
      },
      isFullShipment,
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
      matchStage.status = status;
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
