import mongoose from 'mongoose';
import Shipment from '../models/Shipment/Shipment.js';
import User from '../models/User.js';
import { config } from '../config/config.js';
import Order from '#models/Orders.js';
import Return from '#models/Return.js';
import {
  createAymakanShipment,
  trackAymakanShipment,
  cancelAymakanShipment,
  createAymakanReverseShipment,
} from './aymakanService.js';
import { formatShipmentDeliveryAddress } from '../helpers/formatShipmentDeliveryAddress.js';
import PickupAddress from '../models/PickUpAddress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { getPagination } from '#helpers/PaginationHandler.js';
import { AYMAKAN_STATUS, AYMAKAN_INFO } from '#util/ayMakanData.js';
import { formatDateTime } from '#root/src/helpers/Common.js';
import { parseInvoiceData } from '#helpers/ParseInvoice.js';
import { ORDER_STATUS_MAP, ORDER_PRIORITY } from '#constants/common.js';
import OrderLogs from '#models/OrderLogs.js';
import { convetDateToUTC } from '#root/src/helpers/Common.js';
import { buildDeliveryPayload, buildCollectionPayload } from '#helpers/AymakanDataHandler.js';

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
      [`${prefix}_name`]: data?.name || data?.email || '',
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
    const collectionData = await PickupAddress.findById(pickUpId).select('-__v');

    return collectionData || false;
  } catch (error) {
    console.error('Error in getPickUpAddress:', error.message);
    throw new Error(error.message);
  }
};
export const saveDeliveryAddress = async (data) => {
  try {
    // Define the unique criteria for checking duplicates
    // (Adjust these fields as per your schema uniqueness)
    const filter = {
      name: data.name,
      phone: data.phone,
      address: data.city,
      city: data.city,
      postcode: data.postalCode,
      country: data.country,
    };

    const update = { $set: data };

    const options = {
      new: true, // return the updated document
      upsert: true, // insert if not found
      setDefaultsOnInsert: true,
    };

    const result = await DeliveryAddress.findOneAndUpdate(filter, update, options);
    return result;
  } catch (error) {
    console.error('Error in saveDeliveryAddress:', error.message);
    throw new Error(error.message);
  }
};
export const createPartialShipmentService = async (shipmentData) => {
  try {
    const { id, sellerId, userId, pickUpId, products = [], pieces = 0 } = shipmentData;

    //  Step 1: Validate required fields
    const missingFields = [];
    if (!id) missingFields.push('id');
    if (!sellerId) missingFields.push('sellerId');
    if (!userId) missingFields.push('userId');
    if (!pickUpId) missingFields.push('pickUpId');
    if (!products || products.length === 0) missingFields.push('products');

    if (missingFields.length > 0) {
      throw new Error(`Missing required shipment fields: ${missingFields.join(', ')}`);
    }

    //  Step 2: Fetch order as a Mongoose document (no .lean())
    const order = await Order.findById(id);
    if (!order) return { success: false, message: 'Order not found.' };

    if (sellerId !== order?.sellerId.toString()) {
      return { success: false, message: 'Wrong seller Id.' };
    }
    const { orderSkuList, merchantOrderNo, orderId } = order;

    // Validate SKU list
    if (!orderSkuList?.skuList || orderSkuList.skuList.length === 0) {
      return { success: false, message: 'Order has empty line items.' };
    }

    // Filter products to valid SKUs
    const validProducts = products.filter((product) => orderSkuList.skuList.some((s) => s.id === product.orderLineId));
    if (validProducts.length === 0) {
      return { success: false, message: 'No valid SKUs found in order for shipment.' };
    }

    // Parse invoice data
    let taxData = null;
    let productsData = null;
    const invoiceData = await parseInvoiceData(id);
    if (invoiceData?.success) {
      taxData = {
        tax_identification_number: invoiceData.invoiceData?.taxIdentificationNumber || '',
        invoice_number: invoiceData.invoiceData?.invoiceNumber || '',
        invoice_date: invoiceData.invoiceData?.invoiceDate || '',
      };

      productsData = products.map((item) => ({
        sku: item?.merchantProductNo,
        qty: Number(item?.quantity || 0),
        price: Number(item?.lineTotalInclVat || 0),
        hs_code: item.hsCode || '1111111',
      }));
    }

    //  Step 3: Find existing shipments for given SKUs
    const productLineIds = products.map((p) => p.orderLineId?.toString());

    const existingShipments = await Shipment.find({
      orderId: id,
      status: { $ne: 'CANCELED' },
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    //  Step 4: Build shipped quantity map
    const shippedQtyMap = {};
    for (const shipment of existingShipments || []) {
      if (!['SHIPMENT_CREATED', 'DELIVERED', 'SHIPPED'].includes(shipment.status)) continue;
      for (const product of shipment.products || []) {
        const orderLineId = String(product.orderLineId);
        const quantity = product.quantity || 0;

        if (productLineIds.includes(orderLineId)) {
          shippedQtyMap[orderLineId] = (shippedQtyMap[orderLineId] || 0) + quantity;
        }
      }
    }

    //  Step 5: Validate shipping quantities against available quantities
    for (const product of products) {
      const orderLineId = String(product.orderLineId);

      const matchedSku = order.orderSkuList?.skuList?.find((sku) => String(sku.id) === orderLineId);

      if (!matchedSku) {
        return { success: false, message: `Product ${orderLineId} not found in order.` };
      }

      const cancellationRequestedQty = matchedSku.cancellationRequestedQuantity || 0;
      const availableQty = matchedSku.quantity - cancellationRequestedQty;
      const alreadyShippedQty = shippedQtyMap[orderLineId] || 0;
      const remainingQty = availableQty - alreadyShippedQty;

      if (remainingQty <= 0) {
        return {
          success: false,
          message: `No available quantity left to ship for product ${orderLineId}.`,
        };
      }

      if (product.quantity > remainingQty) {
        return {
          success: false,
          message: `Cannot ship ${product.quantity} units of product ${orderLineId}, only ${remainingQty} units available.`,
        };
      }
    }

    //  Step 6: Prepare delivery & pickup details
    const deliveryData = await formatShipmentDeliveryAddress(order.orderShippingAddress, order.orderCustomer);
    if (!deliveryData) throw new Error('Invalid delivery information');
    const deliveryDetails = await saveDeliveryAddress(deliveryData);

    const collectionData = await getPickUpAddress(pickUpId);
    if (!collectionData) throw new Error('Invalid pickup information');

    //  Step 7: Create shipment in Aymakan
    const aymakanResult = await createShipmentWithAymakan({
      ...shipmentData,
      deliveryData,
      collectionData,
      pieces,
      taxData,
      productsData,
    });

    if (!aymakanResult?.success) {
      return { success: false, message: 'Shipment by Aymakan encountered an error.' };
    }

    const trackingNumber = aymakanResult.shipping.tracking_number;
    const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;

    //  Step 8: Track shipment for initial status info
    const aymakanTrackingResult = await trackAymakanShipment(trackingNumber);
    const trackingInfo = Array.isArray(aymakanTrackingResult?.trackingInfo)
      ? aymakanTrackingResult.trackingInfo.map((info) => ({
          statusCode: info?.status_code ?? '',
          description: info?.description ?? '',
          descriptionAr: info?.description_ar ?? '',
          reasonCode: info?.reason_code ?? '',
          reasonEn: info?.reason_en ?? '',
          reasonAr: info?.reason_ar ?? '',
          createdAt: info?.created_at ? new Date(info.created_at) : new Date(),
        }))
      : [];

    //  Step 9: Prepare & save shipment document
    const shipmentDocument = new Shipment({
      orderId: new mongoose.Types.ObjectId(id),
      sellerId: new mongoose.Types.ObjectId(sellerId),
      userId: new mongoose.Types.ObjectId(userId),
      deliveryId: deliveryDetails?._id,
      pickUpId: collectionData?._id,
      airWaybillNo: trackingNumber,
      merchantShipmentNo,
      merchantOrderNo,
      status: AYMAKAN_STATUS['AY-0001'].status,
      trackingInfo,
      products: validProducts,
      shipmentMethod: 'AYMAKAN',
      extraData: { aymakan: aymakanResult },
      shipmentMerchantDetails: {
        name: AYMAKAN_INFO.NAME,
        email: AYMAKAN_INFO.EMAIL,
      },
      pieces,
      type: 'FORWARD',
    });

    await shipmentDocument.save();

    //  Step 10: Update order SKUs with AWB number
    for (const product of validProducts) {
      const sku = order.orderSkuList.skuList.find((s) => String(s.id) === String(product.orderLineId));
      if (sku) sku.airWaybillNo = trackingNumber;
    }

    if (!order?.sellerId) {
      order.sellerId = sellerId;
    }

    order.status = 'IN_PROGRESS';
    await order.save();
    const logEntry = {
      status: 'SHIPMENT CREATED',
      description: `Shipment created with AWB -${trackingNumber}`,
      createdAt: new Date(),
    };

    await OrderLogs.updateOne({ orderId: id }, { $push: { details: logEntry } }, { upsert: true });
    return { success: true, shipmentId: shipmentDocument._id };
  } catch (error) {
    console.error('Error in createPartialShipmentService:', error);
    throw error;
  }
};

export const getAllShipmentsService = async ({ page = 1, size = 10, sellerId, status, search, sortOrder = 'desc' }) => {
  try {
    const currentPage = parseInt(page);
    const perPage = parseInt(size);
    const skip = (currentPage - 1) * perPage;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const matchStage = {
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    // Applied filters object
    const appliedFilters = {};

    if (status) {
      const statusArray = status.split(',').map((s) => s.trim()); // ['pending','closed','open']
      matchStage.status = {
        $in: statusArray.map((s) => new RegExp(`^${s}$`, 'i')),
      };
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
          shipmentMethod: 1,
          shipmentMerchantDetails: 1,
          deliveryCustomer: {
            name: { $ifNull: ['$deliveryInfo.name', '$shipmentMerchantDetails.name'] },
            email: { $ifNull: ['$deliveryInfo.email', '$shipmentMerchantDetails.email'] },
          },
        },
      },
      { $sort: { createdAt: sortDirection } },
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

export const getAllShipmentsAdminService = async ({
  page = 1,
  size = 10,
  sellerId,
  status,
  search,
  sortOrder = 'desc',
}) => {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const perPage = Math.min(parseInt(size, 10) || 10, 100);
  const skip = (currentPage - 1) * perPage;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  const matchStage = {};
  const appliedFilters = {};

  if (sellerId) {
    matchStage.sellerId = new mongoose.Types.ObjectId(sellerId);
    appliedFilters.sellerId = sellerId;
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim().toUpperCase());
    matchStage.status = { $in: statuses };
    appliedFilters.status = status;
  }

  const pipeline = [
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

  const trimmedSearch = search?.trim();

  if (trimmedSearch && trimmedSearch.length <= 50) {
    const safeRegex = new RegExp(trimmedSearch, 'i');

    pipeline.push({
      $match: {
        $or: [
          { airWaybillNo: { $regex: safeRegex } },
          { status: { $regex: safeRegex } },
          { 'shipmentMerchantDetails.name': { $regex: safeRegex } },
          { 'deliveryInfo.name': { $regex: safeRegex } },
        ],
      },
    });

    appliedFilters.search = trimmedSearch;
  }

  pipeline.push(
    {
      $project: {
        orderId: 1,

        createdAt: 1,
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
    { $sort: { createdAt: sortDirection } },
    { $skip: skip },
    { $limit: perPage }
  );

  const shipmentData = await Shipment.aggregate(pipeline);

  const total = await Shipment.countDocuments(matchStage);

  return {
    shipments: shipmentData,
    pagination: getPagination(total, currentPage, perPage),
    appliedFilters,
  };
};

export const ayMakanWebHookService = async (data) => {
  try {
    if (!data?.tracking) {
      return { success: false, message: 'Missing tracking in webhook payload' };
    }

    // ---------------- FIND SHIPMENT ----------------
    const shipmentData = await Shipment.findOne(
      { airWaybillNo: data.tracking },
      {
        _id: 1,
        merchantShipmentNo: 1,
        merchantOrderNo: 1,
        products: 1,
        airWaybillNo: 1,
        status: 1,
        orderId: 1,
      }
    ).lean();

    if (!shipmentData) {
      return { success: false, message: `Shipment not found for AWB: ${data.tracking}` };
    }

    // ---------------- MAP STATUS ----------------
    const shipmentStatus = AYMAKAN_STATUS[data.status]?.status?.toUpperCase();

    if (!shipmentStatus) {
      return { success: false, message: `Unknown Aymakan status: ${data.status}` };
    }

    // ---------------- DUPLICATE WEBHOOK ----------------
    if ((shipmentData.status || '').toUpperCase() === shipmentStatus) {
      return {
        success: true,
        message: 'Duplicate webhook ignored',
        shipmentId: shipmentData._id,
      };
    }

    // ---------------- CHANNEL ENGINE ----------------
    if (shipmentStatus === 'SHIPPED') {
      await createShipmentWithChannelEngine({
        merchantShipmentNo: shipmentData.merchantShipmentNo,
        merchantOrderNo: shipmentData.merchantOrderNo,
        lines: shipmentData.products || [],
        trackTraceNo: shipmentData.airWaybillNo,
        method: 'Aymakan',
        shippedFromCountryCode: data.delivery_country,
        shipmentDate: data.date_time,
        isMerchantCreator: true,
        airWaybillNo: shipmentData.airWaybillNo,
      });
    }

    if (shipmentStatus === 'DELIVERED') {
      await safeExecute(async () => {
        await updateShipmentDeliveryStateChannelEngine(
          'DELIVERED',
          data?.tracking?.delivery_date || new Date(),
          shipmentData.merchantShipmentNo
        );
      }, 'Updating delivery state in ChannelEngine');
    }

    // ---------------- UPDATE SHIPMENT ----------------
    await Shipment.findByIdAndUpdate(shipmentData._id, {
      status: shipmentStatus,
      trackingInfo: (data.tracking_info || []).map((i) => ({
        statusCode: i.status_code,
        description: i.description,
        createdAt: i.created_at,
      })),
    });

    // ---------------- ORDER STATUS DERIVATION ----------------
    const order = await Order.findById(shipmentData.orderId).lean();
    if (!order) throw new Error('Order not found for shipment');

    const allShipments = await Shipment.find({
      orderId: shipmentData.orderId,
      status: { $ne: 'CANCELED' },
    }).lean();

    // 8. BUILD SHIPPED/DELIVERED QTY MAPS

    const shippedQtyBySku = {};
    const deliveredQtyBySku = {};

    for (const shipment of allShipments) {
      for (const p of shipment.products || []) {
        const key = p.orderLineId; // Number, matches sku.id

        if (shipment.status === 'SHIPPED') {
          shippedQtyBySku[key] = (shippedQtyBySku[key] || 0) + (p.quantity || 0);
        }

        if (shipment.status === 'DELIVERED') {
          deliveredQtyBySku[key] = (deliveredQtyBySku[key] || 0) + (p.quantity || 0);
        }
      }
    }

    // 9. DERIVE ORDER STATUS

    const skuList = order.orderSkuList?.skuList || [];
    let totalEffectiveQty = 0;
    let allDelivered = true;
    let allFullyShipped = true;
    const hasAnyShipment = allShipments.length > 0;

    for (const sku of skuList) {
      const key = sku.id; // Number
      const orderedQty = sku.quantity || 0;
      const cancelledQty = sku.cancellationRequestedQuantity || 0;
      const effectiveQty = Math.max(orderedQty - cancelledQty, 0);

      totalEffectiveQty += effectiveQty;

      const shippedQty = shippedQtyBySku[key] || 0;
      const deliveredQty = deliveredQtyBySku[key] || 0;

      if (deliveredQty < effectiveQty) allDelivered = false;
      if (shippedQty < effectiveQty || deliveredQty > 0) allFullyShipped = false;
    }

    let finalOrderStatus;

    if (totalEffectiveQty === 0) finalOrderStatus = 'NEW';
    else if (allDelivered) finalOrderStatus = 'DELIVERED';
    else if (allFullyShipped) finalOrderStatus = 'SHIPPED';
    else if (hasAnyShipment) finalOrderStatus = 'IN_PROGRESS';
    else finalOrderStatus = 'NEW';

    // 10. ORDER STATUS PRIORITY GUARD

    const currentStatus = (order.status || '').toUpperCase().trim();
    const newStatus = finalOrderStatus.toUpperCase().trim();

    const canUpdate =
      newStatus === 'NEW'
        ? currentStatus !== 'NEW'
        : ORDER_PRIORITY.indexOf(newStatus) > ORDER_PRIORITY.indexOf(currentStatus);

    if (canUpdate) {
      await Order.findByIdAndUpdate(order._id, { status: finalOrderStatus });

      await OrderLogs.updateOne(
        { orderId: order._id },
        {
          $push: {
            details: {
              status: finalOrderStatus,
              description:
                finalOrderStatus === 'DELIVERED'
                  ? 'All items delivered'
                  : finalOrderStatus === 'SHIPPED'
                    ? 'All items shipped'
                    : finalOrderStatus === 'IN_PROGRESS'
                      ? 'Order in progress'
                      : 'All items cancelled',
              createdAt: convetDateToUTC(new Date()),
            },
          },
        },
        { upsert: true }
      );
    }

    return {
      success: true,
      message: `Shipment ${data.tracking} updated successfully`,
      shipmentId: shipmentData._id,
      orderStatus: finalOrderStatus,
    };
  } catch (error) {
    console.error('ayMakanWebHookService error:', error);
    throw new Error('Failed to process AyMakan webhook: ' + error.message);
  }
};

export const getSingleShipmentService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid shipment ID');
  }
  const shipmentData = await Shipment.findOne({ _id: id }, { type: 1, _id: 1 });

  if (!shipmentData) {
    throw new Error('Shipment not found');
  }
  const shipmentType = shipmentData?.type;
  const pipeLine = [{ $match: { _id: new mongoose.Types.ObjectId(id) } }];

  // --- Add address lookups early, based on shipmentType ---
  if (shipmentType === 'FORWARD') {
    pipeLine.push(
      {
        $lookup: {
          from: 'deliveryaddresses',
          localField: 'deliveryId',
          foreignField: '_id',
          as: 'deliveryDetails',
        },
      },
      { $unwind: { path: '$deliveryDetails', preserveNullAndEmptyArrays: true } },

      // Lookup pickup address
      {
        $lookup: {
          from: 'pickupaddresses',
          localField: 'pickUpId',
          foreignField: '_id',
          as: 'pickupDetails',
        },
      },
      { $unwind: { path: '$pickupDetails', preserveNullAndEmptyArrays: true } }
    );
  } else if (shipmentType === 'REVERSE') {
    pipeLine.push(
      {
        $lookup: {
          from: 'deliveryaddresses',
          localField: 'pickUpId',
          foreignField: '_id',
          as: 'deliveryDetails',
        },
      },
      { $unwind: { path: '$deliveryDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'pickupaddresses',
          localField: 'deliveryId',
          foreignField: '_id',
          as: 'pickupDetails',
        },
      },
      { $unwind: { path: '$pickupDetails', preserveNullAndEmptyArrays: true } }
    );
  }

  // --- Then continue with rest of lookups (common for both types) ---
  pipeLine.push(
    // Lookup order details
    {
      $lookup: {
        from: 'channelengineorders',
        localField: 'orderId',
        foreignField: '_id',
        as: 'orderDetails',
      },
    },
    { $unwind: { path: '$orderDetails', preserveNullAndEmptyArrays: true } },

    //  Lookup matching products (handles case & type mismatch)
    {
      $lookup: {
        from: 'products',
        let: { productSkuCodes: '$products.merchantProductNo' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  { $toLower: '$productSkuCode' },
                  {
                    $map: {
                      input: '$$productSkuCodes',
                      as: 'sku',
                      in: { $toLower: { $toString: '$$sku' } },
                    },
                  },
                ],
              },
            },
          },
          { $project: { images: 1, name: 1, productSkuCode: 1 } },
        ],
        as: 'productDetails',
      },
    },

    //  Optionally merge product details into shipment products
    {
      $addFields: {
        products: {
          $map: {
            input: '$products',
            as: 'p',
            in: {
              $mergeObjects: [
                '$$p',
                {
                  productInfo: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$productDetails',
                          as: 'pd',
                          cond: {
                            $eq: [
                              { $toLower: '$$pd.productSkuCode' },
                              { $toLower: { $toString: '$$p.merchantProductNo' } },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },

    // Final shape of output
    {
      $project: {
        _id: 1,
        status: 1,
        airWaybillNo: 1,
        merchantShipmentNo: 1,
        merchantOrderNo: 1,
        method: 1,
        pieces: 1,
        submissionDate: 1,
        pickupDate: 1,
        products: 1,
        deliveryDate: 1,
        createdAt: 1,
        updatedAt: 1,
        shipmentMethod: 1,
        shipmentMerchantDetails: 1,
        deliveryDetails: 1,
        pickupDetails: 1,
        customerInfo: '$orderDetails.orderCustomer',
        paymentInfo: '$orderDetails.orderPaymentDetails',
      },
    }
  );

  const shipment = await Shipment.aggregate(pipeLine);

  if (!shipment || shipment.length === 0) {
    throw new Error('Shipment not found');
  }

  const formattedShipmentData = transformShipmentResponse(shipment[0]);

  // Fetch tracking info only if we have an AWB number and it's not a MANUAL shipment
  let trackingData = null;
  if (formattedShipmentData?.airWaybillNo && shipment[0]?.shipmentMethod === 'AYMAKAN') {
    trackingData = await trackAymakanShipment(formattedShipmentData.airWaybillNo);
    formattedShipmentData.trackingInfo = formatShipmentTrackingInfo(trackingData?.trackingInfo);
  }

  return formattedShipmentData;
};

const transformShipmentResponse = (response) => {
  if (!response) return null;
  const data = response;

  // Delivery Address
  const deliveryDetails = {
    address: [data.deliveryDetails?.address].filter(Boolean).join(', '),
    city: data.deliveryDetails?.city,
    region: data.deliveryDetails?.country,
    zipCode: data.deliveryDetails?.postcode,
    name: data.deliveryDetails?.name || data.deliveryDetails?.email || 'NA',
    email: data.deliveryDetails?.email,
    country: data.deliveryDetails?.country,
    phoneNumber: data.deliveryDetails?.phone,
  };
  // Pickup Address
  const pickUpDetails = {
    address: data.pickupDetails?.address,
    city: data.pickupDetails?.city,
    region: data.pickupDetails?.country,
    zipCode: data.pickupDetails?.postcode,
    name: data.pickupDetails?.name || data.pickupDetails?.email || 'NA',
    email: data.pickupDetails?.email,
    country: data.pickupDetails?.country,
    phoneNumber: data.pickupDetails?.phone,
  };

  // Payment Info
  const paymentInfo = {
    paymentReferenceNo: data.paymentInfo.paymentReferenceNo,
    paymentMethod: data?.paymentInfo?.paymentMethod,
    currencyCode: data?.paymentInfo?.currencyCode,
    vatNo: data?.paymentInfo?.vatNo,
    orderId: data?.paymentInfo?.orderId,
  };

  // Customer Info
  const customerInfo = {
    name: `${data.customerInfo?.firstName || ''} ${data.customerInfo?.lastName || ''}`.trim(),
    email: data.customerInfo?.email,
    phoneNo: data.customerInfo?.phone,
  };

  return {
    _id: data?._id,
    orderId: data?.orderId,
    paymentInfo,
    customerInfo,
    status: data.status,
    products: data.products,
    airWaybillNo: data.airWaybillNo,
    merchantShipmentNo: data.merchantShipmentNo,
    createdAt: data?.createdAt,
    pieces: data.pieces,
    merchantOrderNo: data.merchantOrderNo,
    deliveryDetails,
    pickUpDetails,
    shipmentMethod: data?.shipmentMethod,
  };
};
export const formatShipmentTrackingInfo = (data) => {
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((item) => {
    const formatted = formatDateTime(item?.createdAt) || formatDateTime(item?.created_at);

    return {
      status: item?.description || '',
      date: formatted?.date || '',
      time: formatted?.time || '',
    };
  });
};

// CANCEL SHIPMENT STARTS HERE
export const cancelShipmentService = async (shipmentId, reason = 'NA') => {
  try {
    const cancelReason = reason?.trim() || 'NA';

    // 1️ Only SHIPMENT_CREATED can be canceled
    const shipment = await Shipment.findOne(
      { _id: shipmentId, status: AYMAKAN_STATUS['AY-0001'].status },
      { _id: 1, airWaybillNo: 1, orderId: 1 }
    );

    if (!shipment) {
      return {
        success: false,
        message: 'No shipment found',
      };
    }

    const trackingNumber = shipment.airWaybillNo;

    //2 Cancel shipment via Aymakan API
    await cancelAymakanShipment(trackingNumber);
    const { orderId, products } = shipment;

    // 23 Cancel shipment

    await Shipment.findByIdAndUpdate(shipment._id, {
      status: 'CANCELED',
      cancelReason,
    });

    // 34 Fetch order

    const order = await Order.findById(orderId).lean();
    if (!order) throw new Error('Order not found');

    //4️ Recalculate SKU statuses

    for (const p of products || []) {
      const sku = order.orderSkuList.skuList.find((s) => s.id === p.orderLineId);

      if (!sku) continue;

      const cancelledQty = sku.cancellationRequestedQuantity || 0;

      let finalSkuStatus;

      // SKU STATUS PRIORITY

      if (cancelledQty > 0) {
        finalSkuStatus = 'PARTIALLY_CANCELED';
      } else {
        finalSkuStatus = 'NEW';
      }

      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            'orderSkuList.skuList.$[sku].status': finalSkuStatus,
          },
        },
        {
          arrayFilters: [{ 'sku.id': p.orderLineId }],
        }
      );
    }

    //5️ Re-fetch updated order for final order status calculation

    const updatedOrder = await Order.findById(orderId).select('orderSkuList.skuList.status').lean();

    if (!updatedOrder?.orderSkuList?.skuList?.length) {
      throw new Error('Order SKU list not found');
    }

    // Rule 1: Order is NEW only if ALL SKUs are NEW
    const allSkusAreNew = updatedOrder.orderSkuList.skuList.every((sku) => sku.status === 'NEW');

    // Rule 2: Any active shipment forces IN_PROGRESS
    const hasActiveShipment = await Shipment.exists({
      orderId,
      status: { $ne: 'CANCELED' },
    });

    const finalOrderStatus = allSkusAreNew && !hasActiveShipment ? 'NEW' : 'IN_PROGRESS';

    // Update order status
    await Order.findByIdAndUpdate(orderId, {
      status: finalOrderStatus,
    });

    // 7️ Order logs

    await OrderLogs.updateOne(
      { orderId },
      {
        $push: {
          details: {
            status: finalOrderStatus,
            description: 'Shipment canceled and order/SKU statuses recalculated',
            createdAt: new Date(),
          },
        },
      },
      { upsert: true }
    );

    return {
      success: true,
      message: 'Shipment canceled successfully',
      shipmentId: shipment._id,
    };
  } catch (error) {
    console.error('cancelShipmentService error:', error);
    throw error;
  }
};

export const syncShipmentStatus = async (orderId) => {
  try {
    // ---------------- FETCH ORDER ----------------
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    // If order already canceled, do nothing
    if (order.status === 'CANCELED') {
      return { success: false, syncedShipments: 0 };
    }

    // ---------------- FETCH SHIPMENTS ----------------
    const shipments = await Shipment.find(
      {
        orderId,
        status: { $ne: 'CANCELED' },
      },
      {
        airWaybillNo: 1,
        _id: 1,
        merchantShipmentNo: 1,
        products: 1,
        merchantOrderNo: 1,
        status: 1,
        shipmentMethod: 1,
      }
    ).lean();

    if (!shipments.length) {
      return { success: true, syncedShipments: 0 };
    }

    // ---------------- PROCESS EACH SHIPMENT ----------------
    for (const shipment of shipments) {
      try {
        // Skip MANUAL shipments
        if (shipment.shipmentMethod === 'MANUAL') {
          continue;
        }

        if (!shipment.airWaybillNo) {
          console.log('Missing AWB, skipping shipment:', shipment._id);
          continue;
        }

        // ---------------- TRACK AYMAKAN ----------------
        const tracking = await trackAymakanShipment(shipment.airWaybillNo);

        const trackingInfo = (tracking?.trackingInfo || []).map((info) => ({
          statusCode: info?.status_code ?? '',
          description: info?.description ?? '',
          descriptionAr: info?.description_ar ?? '',
          reasonCode: info?.reason_code ?? '',
          reasonEn: info?.reason_en ?? '',
          reasonAr: info?.reason_ar ?? '',
          createdAt: info?.created_at ? new Date(info.created_at) : new Date(),
        }));

        if (!trackingInfo.length) {
          console.log('No tracking info for shipment:', shipment._id);
          continue;
        }

        const latest = trackingInfo[0];
        let shipmentStatus = AYMAKAN_STATUS[latest?.statusCode]?.status?.toUpperCase() || 'UNKNOWN';
        // PICKED must behave as SHIPPED
        if (shipmentStatus === 'PICKED') {
          shipmentStatus = 'SHIPPED';
        }

        if (shipmentStatus === 'UNKNOWN') {
          console.warn(`Unknown status for shipment ${shipment._id}:`, latest?.statusCode);
          continue;
        }

        // Avoid duplicate / downgrade updates
        if (shipment.status && ORDER_PRIORITY.indexOf(shipmentStatus) <= ORDER_PRIORITY.indexOf(shipment.status)) {
          console.log('Skipping downgrade or duplicate update:', shipment.status, '→', shipmentStatus);
          continue;
        }

        // ---------------- APPLY UPDATE ----------------

        await handleShipmentStatusUpdate({
          shipment,
          tracking,
          shipmentStatus,
          trackingInfo,
          orderId,
        });
      } catch (shipmentErr) {
        console.error(`Error processing shipment ${shipment._id}:`, shipmentErr.message);
      }
    }

    return {
      success: true,
      syncedShipments: shipments.length,
    };
  } catch (err) {
    console.error('Error syncing shipment status:', err.message);
    return { success: false, message: err.message };
  }
};

/**
 * Handles updates related to a single shipment’s status.
 */
async function handleShipmentStatusUpdate({ shipment, tracking, shipmentStatus, trackingInfo, orderId }) {
  const { airWaybillNo, merchantShipmentNo, merchantOrderNo, products, _id: shipmentId } = shipment;

  /* -------------------- 1️ CHANNEL ENGINE -------------------- */

  if (shipmentStatus === 'SHIPPED') {
    await safeExecute(async () => {
      await createShipmentWithChannelEngine({
        merchantShipmentNo,
        merchantOrderNo,
        lines: products || [],
        extraData: {},
        trackTraceNo: airWaybillNo,
        trackTraceUrl: '',
        returnTrackTraceNo: '',
        method: 'Aymakan',
        shippedFromCountryCode: tracking?.collection_country,
        shipmentDate: tracking?.pickup_date,
        returnMethod: '',
        isMerchantCreator: true,
        airWaybillNo,
      });
    }, 'creating shipment in ChannelEngine');
  }

  if (shipmentStatus === 'DELIVERED') {
    await safeExecute(async () => {
      await updateShipmentDeliveryStateChannelEngine(
        'DELIVERED',
        tracking?.delivery_date || tracking?.pickup_date || new Date(),
        merchantShipmentNo
      );
    }, 'updating delivery state in ChannelEngine');
  }

  /* -------------------- 2️ UPDATE SHIPMENT -------------------- */

  await Shipment.findByIdAndUpdate(
    shipmentId,
    {
      status: shipmentStatus,
      trackingInfo,
    },
    { new: true }
  );

  /* -------------------- 3️ UPDATE SKU STATUS -------------------- */

  const orderLineIds = (products || []).map((p) => p.orderLineId).filter(Boolean);
  if (orderLineIds.length > 0) {
    const orderSkuStatus = shipmentStatus;

    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          'orderSkuList.skuList.$[sku].status': orderSkuStatus,
        },
      },
      {
        arrayFilters: [
          {
            'sku.id': { $in: orderLineIds },
            'sku.status': { $ne: ORDER_STATUS_MAP.PARTIALLY_CANCELED },
          },
        ],
      }
    );
  }

  /* -------------------- 4️ ORDER LOG -------------------- */

  const logEntry = createLogEntry(shipmentStatus, airWaybillNo, tracking, trackingInfo);

  if (logEntry) {
    await OrderLogs.updateOne({ orderId }, { $push: { details: logEntry } }, { upsert: true });
  }

  /* -------------------- 5️ ORDER STATUS DERIVATION -------------------- */

  const order = await Order.findById(orderId).lean();

  if (!order || order.status === 'CANCELED') {
    console.log('Order canceled or missing, skipping order status sync');
    return;
  }

  // Fetch all non-canceled shipments
  const shipments = await Shipment.find({
    orderId,
    status: { $in: ['SHIPPED', 'DELIVERED'] },
  }).lean();

  const fulfilledQtyMap = {};
  const deliveredQtyMap = {};

  shipments.forEach((s) =>
    s.products?.forEach((p) => {
      const id = String(p.orderLineId);
      const qty = p.quantity || 0;

      fulfilledQtyMap[id] = (fulfilledQtyMap[id] || 0) + qty;

      if (s.status === 'DELIVERED') {
        deliveredQtyMap[id] = (deliveredQtyMap[id] || 0) + qty;
      }
    })
  );

  let hasAnyFulfilled = false;
  let allAvailableFulfilled = true;
  let allAvailableDelivered = true;

  for (const sku of order.orderSkuList.skuList) {
    const orderedQty = sku.quantity || 0;
    const cancelledQty = sku.cancellationRequestedQuantity || 0;
    const availableQty = orderedQty - cancelledQty;

    const fulfilledQty = fulfilledQtyMap[String(sku.id)] || 0;
    const deliveredQty = deliveredQtyMap[String(sku.id)] || 0;

    if (fulfilledQty > 0) hasAnyFulfilled = true;
    if (fulfilledQty < availableQty) allAvailableFulfilled = false;
    if (deliveredQty < availableQty) allAvailableDelivered = false;
  }

  let finalOrderStatus = order.status;

  if (allAvailableDelivered) {
    finalOrderStatus = 'DELIVERED';
  } else if (allAvailableFulfilled) {
    finalOrderStatus = 'SHIPPED';
  } else if (hasAnyFulfilled) {
    finalOrderStatus = 'IN_PROGRESS';
  }

  // Apply only if moving forward
  if (ORDER_PRIORITY.indexOf(finalOrderStatus) > ORDER_PRIORITY.indexOf(order.status)) {
    await Order.findByIdAndUpdate(orderId, {
      $set: { status: finalOrderStatus },
    });

    const orderLog = createLogEntry(finalOrderStatus, airWaybillNo, tracking, trackingInfo, true);
    await OrderLogs.updateOne({ orderId }, { $push: { details: orderLog } }, { upsert: true });
  }
}

/**
 * Creates a standardized log entry.
 */
function createLogEntry(status, awb, tracking, trackingInfo, isOrder = false) {
  const localTime = trackingInfo?.[0]?.createdAt || new Date();
  const utcTime = convetDateToUTC(localTime);
  const label = isOrder ? 'Order' : 'Shipment';

  switch (status) {
    case 'DELIVERED':
      return {
        status: 'DELIVERED',
        description: `${label} delivered${isOrder ? '' : ` with AWB:${awb}`}`,
        createdAt: tracking?.delivery_date || new Date(),
      };
    case 'PICKED':
      return {
        status: 'PICKED',
        description: `${label} picked${isOrder ? '' : ` with AWB:${awb}`}`,
        createdAt: tracking?.pickup_date || new Date(),
      };
    case 'CANCELED':
      return {
        status: 'CANCELED',
        description: `${label} canceled${isOrder ? '' : ` with AWB:${awb}`}`,
        createdAt: utcTime,
      };
    default:
      return null;
  }
}

/**
 * Wraps an async call with try/catch to avoid breaking loop.
 */
async function safeExecute(fn, label) {
  try {
    await fn();
  } catch (err) {
    console.error(`Error ${label}:`, err.message);
  }
}
export const createReverseShipmentWithAymakan = async (shipmentData) => {
  try {
    const {
      userId,
      declaredValue,
      deliveryData = {},
      collectionData = {},
      pieces,
      formatedProducts = [],
      currency = 'SAR',
      codAmount = 0,
      isCod = false,
      weight,
    } = shipmentData;

    // Resolve requested_by

    let requestedBy = 'Unknown';
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).lean();
      if (!user) throw new Error('User not found for requested_by');
      requestedBy = user.firstName || user.username || 'Unknown';
    }

    // Format products

    const products = formatedProducts.map((item) => ({
      sku: item?.merchantProductNo,
      qty: Number(item?.quantity) || 1,
      price: Number(item?.price) || 0,
    }));

    if (!products.length) {
      throw new Error('At least one product is required for reverse shipment');
    }

    // Calculate declared value

    const calculatedDeclaredValue = declaredValue ?? products.reduce((sum, p) => sum + p.price * p.qty, 0);

    const finalDeclaredValue = calculatedDeclaredValue > 0 ? calculatedDeclaredValue : 1;

    // Final Aymakan Payload

    const payload = {
      requested_by: requestedBy.trim(),

      declared_value: finalDeclaredValue,
      declared_value_currency: 'SAR',
      currency,

      is_cod: isCod ? 1 : 0,
      cod_amount: isCod ? Number(codAmount) || 0 : 0,

      ...buildDeliveryPayload(deliveryData),
      ...buildCollectionPayload(collectionData),

      weight: Number(weight) > 0 ? Number(weight) : 1,
      pieces: Number(pieces) > 0 ? Number(pieces) : 1,
      items_count: products.length,

      products: products,
    };

    const result = await createAymakanReverseShipment(payload);

    // ---  Validate Aymakan response ---
    if (!result?.success || !result?.shipping?.tracking_number) {
      throw new Error('Aymakan reverse shipment creation failed');
    }

    return result;
  } catch (error) {
    console.error('Aymakan Service Error:', error.message);
    throw error;
  }
};

export const createReverseShipmentService = async (shipmentData) => {
  try {
    const { orderId, userId, deliverId, pieces = 0, returnId } = shipmentData;

    //  Step 1: Validate required fields
    const missingFields = [];
    if (!orderId) missingFields.push('orderId');
    if (!userId) missingFields.push('userId');
    if (!deliverId) missingFields.push('deliverId');
    if (!returnId) missingFields.push('returnId');

    if (missingFields.length > 0) {
      throw new Error(`Missing required shipment fields: ${missingFields.join(', ')}`);
    }

    //  Step 2: Fetch order as a Mongoose document (no .lean())
    const order = await Order.findById(orderId);

    if (!order) return { success: false, message: 'Order not found.' };

    const returnData = await Return.findById(returnId);

    if (!returnData) return { success: false, message: 'Return data not found.' };

    const returnProducts = returnData?.products;
    const { merchantOrderNo, orderSkuList, sellerId } = order;

    // Validate SKU list
    if (!returnProducts || returnProducts.length === 0) {
      return { success: false, message: 'Retrun has empty line items.' };
    }

    // Filter products to valid SKUs
    const validProducts = returnProducts.filter((product) =>
      orderSkuList.skuList.some((s) => s.merchantProductNo === product.productSkuCode)
    );
    if (validProducts.length === 0) {
      return { success: false, message: 'No valid SKUs found in order for shipment.' };
    }

    //  Step 3: Find existing shipments for given SKUs
    const productLineIds = returnProducts.map((p) => p.productSkuCode);

    const existingShipments = await Shipment.find({
      orderId,
      type: 'REVERSE',
      status: { $ne: 'CANCELED' },
      'products.merchantProductNo': { $in: productLineIds },
    }).lean();
    if (existingShipments && existingShipments?.length !== 0) {
      return { success: false, message: `Shipment already created` };
    }
    //  Step 6: Prepare delivery & pickup details
    const pickUpData = await formatShipmentDeliveryAddress(order.orderShippingAddress, order.orderCustomer);
    if (!pickUpData) throw new Error('Invalid pickup information');
    const collectionData = await saveDeliveryAddress(pickUpData);

    const deliveryData = await getPickUpAddress(deliverId);
    if (!deliveryData) throw new Error('Invalid delivery information');
    const formatedProducts = returnProducts?.map((pro) => {
      const plain = JSON.parse(JSON.stringify(pro));

      return {
        orderLineId: plain.orderLineId,
        quantity: plain.quantity,
        merchantProductNo: plain.productSkuCode,
        price: plain.price,
      };
    });

    // //  Step 7: Create shipment in Aymakan
    const aymakanResult = await createReverseShipmentWithAymakan({
      ...shipmentData,
      deliveryData,
      collectionData,
      pieces,
      formatedProducts,
    });

    if (!aymakanResult?.success) {
      return { success: false, message: 'Shipment by Aymakan encountered an error.' };
    }

    const trackingNumber = aymakanResult.shipping.tracking_number;

    const merchantShipmentNo = `MS-${orderId}-${Date.now()}`;

    //  Step 8: Track shipment for initial status info
    const aymakanTrackingResult = await trackAymakanShipment(trackingNumber);
    const trackingInfo = Array.isArray(aymakanTrackingResult?.trackingInfo)
      ? aymakanTrackingResult.trackingInfo.map((info) => ({
          statusCode: info?.status_code ?? '',
          description: info?.description ?? '',
          descriptionAr: info?.description_ar ?? '',
          reasonCode: info?.reason_code ?? '',
          reasonEn: info?.reason_en ?? '',
          reasonAr: info?.reason_ar ?? '',
          createdAt: info?.created_at ? new Date(info.created_at) : new Date(),
        }))
      : [];

    //  Step 9: Prepare & save shipment document
    const shipmentDocument = new Shipment({
      orderId: new mongoose.Types.ObjectId(orderId),
      sellerId: new mongoose.Types.ObjectId(sellerId),
      userId: new mongoose.Types.ObjectId(userId),
      deliveryId: deliveryData?._id,
      pickUpId: collectionData?._id,
      airWaybillNo: trackingNumber,
      merchantShipmentNo,
      merchantOrderNo,
      status: AYMAKAN_STATUS['AY-0001'].status,
      trackingInfo,
      products: formatedProducts,
      extraData: { aymakan: aymakanResult },
      shipmentMerchantDetails: {
        name: AYMAKAN_INFO.NAME,
        email: AYMAKAN_INFO.EMAIL,
      },
      pieces,
      type: 'REVERSE',
    });

    const newShipmentData = await shipmentDocument.save();

    // ACKNOWLDGE CHANNEL ENGINE ABOUT APPROVAL
    const ceUrl = `${CHANNEL_ENGINE_BASE_URL}returns/merchant/acknowledge?apikey=${CHANNEL_ENGINE_API_KEY}`;
    await fetch(ceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ReturnId: returnData?.returnId,
        MerchantReturnNo: returnData?.merchantReturnNo,
      }),
    });

    // UPDATE RETURN STATUS AS APPROVED
    await Return.findByIdAndUpdate(
      returnId,
      {
        $set: { status: 'SHIPMENT_CREATED' },
        $push: {
          shipmentId: newShipmentData?._id,
          logs: {
            status: 'SHIPMENT_CREATED',
            description: 'Shipment Created',
            createdAt: new Date(),
          },
        },
      },
      { new: true } // optional: returns the updated document
    );

    return { success: true, shipmentId: shipmentDocument._id };
  } catch (error) {
    console.error('Error in createPartialShipmentService:', error);
    throw error;
  }
};
export const createManualShipmentService = async (shipmentData) => {
  try {
    const {
      orderId,
      sellerId,
      userId,
      pickUpId,
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
    if (!pickUpId) missingFields.push('pickUpId');
    if (!airWaybillNo) missingFields.push('airWaybillNo');
    if (!merchantShipmentNo) missingFields.push('merchantShipmentNo');
    if (!method) missingFields.push('method');
    if (!products || products.length === 0) missingFields.push('products');

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    /* -------------------- PARALLEL FETCH -------------------- */
    const [existingMerchantShipment, existingAwb, order, user] = await Promise.all([
      Shipment.findOne({ merchantShipmentNo }),
      Shipment.findOne({ airWaybillNo }),
      Order.findById(orderId).lean(),
      User.findById(userId).lean(),
    ]);

    if (existingMerchantShipment) throw new Error(`Merchant shipment number '${merchantShipmentNo}' already exists`);
    if (existingAwb) throw new Error(`AWB number '${airWaybillNo}' already exists`);
    if (!order) throw new Error(`Order with ID ${orderId} not found`);
    if (!user) throw new Error(`User with ID ${userId} not found`);

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
    const pickupData = await getPickUpAddress(pickUpId);
    if (!pickupData) throw new Error('Invalid pickup address ID');

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

    const shipment = await new Shipment({
      orderId,
      sellerId,
      userId,
      deliveryId,
      pickUpId: pickupData._id,
      airWaybillNo,
      merchantShipmentNo,
      merchantOrderNo: order.merchantOrderNo || order.orderId,
      method,
      shippedFromCountryCode,
      products: validatedProducts,
      pieces: totalPieces,
      status: 'SHIPPED',
      submissionDate: new Date(),
      shipmentMethod: 'MANUAL',
      isMerchantCreator: true,
      ...(description && { description }),
    }).save();

    /* -------------------- CHANNEL ENGINE -------------------- */
    await createShipmentWithChannelEngine({
      merchantShipmentNo,
      merchantOrderNo: order.merchantOrderNo || order.orderId,
      lines: validatedProducts,
      trackTraceNo: airWaybillNo,
      trackTraceUrl,
      method,
      shippedFromCountryCode,
      shipmentDate: new Date(),
      isMerchantCreator: true,
      airWaybillNo,
    });

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

    /* -------------------- LOGS -------------------- */
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
      message: 'MANUAL shipment created successfully',
      shipmentId: shipment._id,
      airWaybillNo,
      merchantShipmentNo,
    };
  } catch (error) {
    console.error('createManualShipmentService error:', error);
    throw new Error(error.message || 'Failed to create MANUAL shipment');
  }
};
export const syncReturnShipmentStatus = async (returnId) => {
  try {
    // Fetch Return Data
    const returnData = await Return.findById(returnId).lean();
    if (!returnData) return { success: false, message: 'Return not found' };

    const shipmentIds = returnData.shipmentId || []; // ensure it's an array

    // Fetch all active shipments whose IDs are in the return data
    const shipments = await Shipment.find(
      {
        _id: { $in: shipmentIds },
        status: { $ne: 'CANCELED' },
      },
      {
        airWaybillNo: 1,
        _id: 1,
        merchantShipmentNo: 1,
        products: 1,
        merchantOrderNo: 1,
        status: 1,
      }
    ).lean();

    if (!shipments.length) return { success: true, syncedShipments: 0 };

    for (const shipment of shipments) {
      try {
        const tracking = await trackAymakanShipment(shipment.airWaybillNo);
        const trackingInfo = (tracking?.trackingInfo || []).map((info) => ({
          statusCode: info?.status_code ?? '',
          description: info?.description ?? '',
          descriptionAr: info?.description_ar ?? '',
          reasonCode: info?.reason_code ?? '',
          reasonEn: info?.reason_en ?? '',
          reasonAr: info?.reason_ar ?? '',
          createdAt: info?.created_at ? new Date(info.created_at) : new Date(),
        }));

        const latest = trackingInfo[0];
        const shipmentStatus = AYMAKAN_STATUS[latest?.statusCode]?.status?.toUpperCase() || 'UNKNOWN';

        if (shipmentStatus === 'UNKNOWN') {
          console.warn(`Unknown status for shipment ${shipment._id}: ${latest?.statusCode}`);
          continue;
        }

        // Handle shipment status actions
        await handleShipmentReturnStatusUpdate({
          shipment,
          shipmentStatus,
          trackingInfo,
          returnId,
        });
      } catch (shipmentErr) {
        console.error(`Error processing shipment ${shipment._id}:`, shipmentErr.message);
      }
    }

    return { success: true, syncedShipments: shipments.length };
  } catch (err) {
    console.error('Error syncing shipment status:', err.message);
    return { success: false, message: err.message };
  }
};

async function handleShipmentReturnStatusUpdate({ shipment, shipmentStatus, trackingInfo, returnId }) {
  // --- 1 Update local shipment record ---
  await Shipment.findByIdAndUpdate(shipment._id, { status: shipmentStatus, trackingInfo }, { new: true });

  // --- 2 Update Return Status

  await Return.updateOne(
    { _id: returnId },
    {
      $set: {
        status: shipmentStatus.toUpperCase(),
      },
    }
  );
}

export async function getChannelEngineShipmentDetailsService(orderMerchantNumber) {
  try {
    const response = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}shipments/merchant?merchantOrderNos=${orderMerchantNumber}&apikey=${CHANNEL_ENGINE_API_KEY}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (!data?.Content?.length) {
      return {
        success: false,
        message: 'No shipment data received from ChannelEngine',
      };
    }

    return {
      success: true,
      data: data.Content,
    };
  } catch (error) {
    console.error('Error fetching shipment details from ChannelEngine:', error.message);
    return {
      success: false,
      message: error.message,
    };
  }
}
export const createShipmentsFromChannelEngine = async ({ order, channelEngineShipments, userId }) => {
  const createdShipments = [];

  for (const ceShipment of channelEngineShipments) {
    // Idempotency check (CE shipment is unique)

    const existing = await Shipment.findOne({
      merchantShipmentNo: ceShipment.MerchantShipmentNo,
    });

    if (existing) {
      createdShipments.push(existing);
      continue;
    }

    // SellerId resolution (OrderLine.ExtraData)

    const sellerId = ceShipment.Lines?.[0]?.OrderLine?.ExtraData?.find((x) => x.Key === 'sellerId')?.Value;

    // Create shipment

    const shipmentData = {
      // References
      orderId: order._id,
      sellerId,
      userId,

      // Status
      status: mapCEShipmentStatus(ceShipment),

      // Identifiers
      merchantShipmentNo: ceShipment.MerchantShipmentNo,
      merchantOrderNo: ceShipment.MerchantOrderNo,

      // TrackTraceNo === airwaybill
      airWaybillNo: ceShipment.TrackTraceNo,

      // Shipping info
      method: ceShipment.Method,
      shippedFromCountryCode: ceShipment.ShippedFromCountryCode || null,
      shippedFromStockLocationId: ceShipment.ShippedFromStockLocationId ?? 0,

      isMerchantCreator: ceShipment.IsMerchantCreator,
      shipmentMethod: 'CHANNEL_ENGINE',

      // Dates
      submissionDate: ceShipment.CreatedAt,
      pickupDate: ceShipment.ShipmentDate,
      deliveryDate: ceShipment.DeliveredAt,

      // Products
      products: buildShipmentProducts(ceShipment.Lines),
      pieces: ceShipment.Lines?.reduce((sum, l) => sum + (l.Quantity || 0), 0),

      // Tracking (only if exists)
      trackingInfo: ceShipment.TrackTraceNo
        ? [
            {
              trackingNo: ceShipment.TrackTraceNo,
              trackingUrl: ceShipment.TrackTraceUrl,
              carrier: ceShipment.Method,
              createdAt: new Date(),
              statusCode: 'NA',
            },
          ]
        : [],

      // Raw CE payload
      extraData: {
        channelEngine: ceShipment,
      },

      // Defaults
      type: 'FORWARD',
    };

    const shipment = await Shipment.create(shipmentData);

    createdShipments.push(shipment);
  }

  return createdShipments;
};

const buildShipmentProducts = (lines = []) => {
  return lines.map((line) => ({
    merchantProductNo: line.MerchantProductNo,
    channelProductNo: line.ChannelProductNo,
    quantity: line.Quantity,
    status: line.ShipmentStatus,
    orderLineId: line.OrderLine?.Id,
    extraData: {
      channelEngine: line,
    },
  }));
};
const mapCEShipmentStatus = (ceShipment) => {
  if (ceShipment.DeliveredAt) return 'DELIVERED';

  if (ceShipment.Lines?.some((l) => l.ShipmentStatus === 'SHIPPED')) {
    return 'SHIPPED';
  }

  return 'SHIPMENT_CREATED';
};

const formatShipmentProducts = (lines = []) =>
  lines.map((line) => ({
    merchantProductNo: line.MerchantProductNo,
    channelProductNo: line.ChannelProductNo,
    quantity: line.Quantity,
    status: line.ShipmentStatus,
    orderLineId: line.OrderLine?.Id,
    extraData: {
      channelEngine: line,
    },
  }));

export const formatChannelEngineShipments = ({ content = [], order, userId }) => {
  return content.map((ceShipment) => {
    // sellerId resolved from OrderLine ExtraData
    const sellerId = ceShipment.Lines?.[0]?.OrderLine?.ExtraData?.find((x) => x.Key === 'sellerId')?.Value;

    return {
      // Required references

      orderId: order._id,
      sellerId,
      userId,

      // Status & dates

      status: mapCEShipmentStatus(ceShipment),
      submissionDate: ceShipment.CreatedAt,
      pickupDate: ceShipment.ShipmentDate,
      deliveryDate: ceShipment.DeliveredAt,

      // Address refs

      deliveryId: order.deliveryId,
      pickUpId: order.pickUpId,

      // ChannelEngine identifiers

      merchantShipmentNo: ceShipment.MerchantShipmentNo,
      merchantOrderNo: ceShipment.MerchantOrderNo,

      // TrackTraceNo === airwaybill
      airWaybillNo: ceShipment.TrackTraceNo,

      shippedFromCountryCode: ceShipment.ShippedFromCountryCode || null,
      shippedFromStockLocationId: ceShipment.ShippedFromStockLocationId ?? 0,

      method: ceShipment.Method,
      isMerchantCreator: ceShipment.IsMerchantCreator,
      shipmentMethod: 'AYMAKAN',

      // Products

      products: formatShipmentProducts(ceShipment.Lines),
      pieces: ceShipment.Lines?.reduce((sum, l) => sum + (l.Quantity || 0), 0),

      // Tracking

      trackingInfo: ceShipment.TrackTraceNo
        ? [
            {
              trackingNo: ceShipment.TrackTraceNo,
              trackingUrl: ceShipment.TrackTraceUrl,
              carrier: ceShipment.Method,
            },
          ]
        : [],

      // Raw CE data

      extraData: {
        channelEngine: ceShipment,
      },

      // Defaults

      type: 'FORWARD',
    };
  });
};

export default {
  ayMakanWebHookService,
  getAllShipmentsService,
  getAllShipmentsAdminService,
  createPartialShipmentService,
  saveDeliveryAddress,
  getPickUpAddress,
  updateShipmentDeliveryStateChannelEngine,
  createShipmentWithChannelEngine,
  createShipmentWithAymakan,
  getSingleShipmentService,
  syncShipmentStatus,
  cancelShipmentService,
  transformShipmentResponse,
  formatShipmentTrackingInfo,
  createReverseShipmentService,
  syncReturnShipmentStatus,
  createManualShipmentService,
};
