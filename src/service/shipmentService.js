import mongoose from 'mongoose';
import Shipment from '../models/Shipment/Shipment.js';
import User from '../models/User.js';
import { config } from '../config/config.js';
import Order from '#models/Orders.js';
import { createAymakanShipment, trackAymakanShipment, cancelAymakanShipment } from './aymakanService.js';
import { formatShipmentDeliveryAddress } from '../helpers/formatShipmentDeliveryAddress.js';
import PickupAddress from '../models/PickUpAddress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { getPagination } from '#helpers/PaginationHandler.js';
import { AYMAKAN_STATUS, AYMAKAN_INFO } from '#util/ayMakanData.js';
import { formatDateTime } from '#root/src/helpers/Common.js';
import { parseInvoiceData } from '#helpers/ParseInvoice.js';
import { ORDER_STATUS_MAP } from '#constants/common.js';
import OrderLogs from '#models/OrderLogs.js';
import { convetDateToUTC } from '#root/src/helpers/Common.js';

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
        hs_code: item.hsCode || '',
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
      if (!['SHIPMENT_CREATED', 'PICKED', 'DELIVERED'].includes(shipment.status)) continue;

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
      shipmentMethod: 'Aymakan',
      extraData: { aymakan: aymakanResult },
      shipmentMerchantDetails: {
        name: AYMAKAN_INFO.NAME,
        email: AYMAKAN_INFO.EMAIL,
      },
      pieces,
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

    // Step 1: Update the SKU statuses first
    await Order.findOneAndUpdate(
      { _id: shipmentData?.orderId },
      {
        $set: {
          'orderSkuList.skuList.$[sku].status': shipmentStatus?.toUpperCase(),
        },
      },
      {
        arrayFilters: [
          {
            'sku.id': { $in: orderLineIdsToUpdate },
            'sku.status': { $ne: 'PARTIALLY_CANCELED' }, //  skip partially canceled items
          },
        ],
        new: false,
      }
    );

    // Step 2: Fetch the updated order
    const order = await Order.findById(shipmentData?.orderId).lean();

    // Step 3: Check if all SKUs have the same target status
    const allMatch = order.orderSkuList?.skuList?.every((sku) => sku.status === shipmentStatus.toUpperCase());

    // Step 4: Update order status if all SKUs match
    if (allMatch) {
      await Order.findByIdAndUpdate(shipmentData?.orderId, {
        $set: { status: shipmentStatus.toUpperCase() },
      });
    }

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

export const getSingleShipmentService = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid shipment ID');
  }

  const shipment = await Shipment.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // Lookup delivery address
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
    { $unwind: { path: '$pickupDetails', preserveNullAndEmptyArrays: true } },

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
        shipmentMerchantDetails: 1,
        deliveryDetails: 1,
        pickupDetails: 1,
        customerInfo: '$orderDetails.orderCustomer',
        paymentInfo: '$orderDetails.orderPaymentDetails',
      },
    },
  ]);

  if (!shipment || shipment.length === 0) {
    throw new Error('Shipment not found');
  }

  const formattedShipmentData = transformShipmentResponse(shipment[0]);

  // Fetch tracking info only if we have an AWB number
  let trackingData = null;
  if (formattedShipmentData?.airWaybillNo) {
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
    // Ensure fallback reason is always non-empty
    const cancelReason = reason?.trim() || 'NA';

    const shipmentData = await Shipment.findOne(
      { _id: shipmentId, status: AYMAKAN_STATUS['AY-0001'].status },
      { _id: 1, airWaybillNo: 1, orderId: 1 }
    );

    if (!shipmentData) {
      return {
        success: false,
        message: 'No shipment found',
      };
    }

    const trackingNumber = shipmentData.airWaybillNo;

    // Cancel shipment via Aymakan API
    await cancelAymakanShipment(trackingNumber);

    // Get latest tracking info
    const aymakanTrackingResult = await trackAymakanShipment(trackingNumber);
    const trackingInfo =
      aymakanTrackingResult?.trackingInfo?.map((info) => ({
        statusCode: info?.status_code || '',
        description: info?.description || '',
        descriptionAr: info?.description_ar || '',
        reasonCode: info?.reason_code || '',
        reasonEn: info?.reason_en || '',
        reasonAr: info?.reason_ar || '',
        createdAt: info?.created_at ? new Date(info.created_at) : new Date(),
      })) || [];

    // Update shipment status in DB
    const updatedShipment = await Shipment.findOneAndUpdate(
      { airWaybillNo: trackingNumber },
      {
        status: 'CANCELED',
        trackingInfo,
        cancelReason,
      },
      { new: true }
    );

    if (!updatedShipment) {
      console.warn(`No shipment found with tracking number: ${trackingNumber}`);
    }
    const logEntry = {
      status: 'SHIPMENT CANCELED',
      description: `Shipment canceled with AWB -${trackingNumber}`,
      createdAt: new Date(),
    };

    await OrderLogs.updateOne({ orderId: shipmentData?.orderId }, { $push: { details: logEntry } }, { upsert: true });
    return {
      success: true,
      message: 'Shipment cancelled successfully',
      shipmentId: updatedShipment?._id,
    };
  } catch (error) {
    console.error('Aymakan Service Error:', error.message, error.stack);
    throw error;
  }
};

export const syncShipmentStatus = async (orderId) => {
  try {
    // Fetch order
    const order = await Order.findById(orderId).lean();
    if (!order) return { success: false, message: 'Order not found' };

    // Fetch all active shipments
    const shipments = await Shipment.find(
      { orderId, status: { $ne: 'CANCELED' } },
      { airWaybillNo: 1, _id: 1, merchantShipmentNo: 1, products: 1, merchantOrderNo: 1, status: 1 }
    ).lean();

    if (!shipments.length) return { success: true, syncedShipments: 0 };

    for (const shipment of shipments) {
      try {
        // Skip manual shipments - they don't use Aymakan tracking
        if (shipment.extraData?.manual?.isManual) {
          console.log(`Skipping Aymakan tracking for manual shipment ${shipment._id}`);
          continue;
        }

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

    return { success: true, syncedShipments: shipments.length };
  } catch (err) {
    console.error('Error syncing shipment status:', err.message);
    return { success: false, message: err.message };
  }
};

/**
 * Handles updates related to a single shipment’s status.
 */
async function handleShipmentStatusUpdate({ shipment, tracking, shipmentStatus, trackingInfo, orderId }) {
  // --- 1️ ChannelEngine integrations ---
  const { airWaybillNo, merchantShipmentNo, merchantOrderNo, products } = shipment;

  if (shipmentStatus === 'PICKED') {
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
        shippedFromCountryCode: tracking.collection_country,
        shipmentDate: tracking.pickup_date,
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
        tracking.delivery_date || tracking.pickup_date,
        merchantShipmentNo
      );
    }, 'updating delivery state in ChannelEngine');
  }

  // --- 2️ Update local shipment record ---
  await Shipment.findByIdAndUpdate(shipment._id, { status: shipmentStatus, trackingInfo }, { new: true });

  // --- 3️ Update order SKU statuses ---
  const orderLineIds = (products || []).map((p) => p.orderLineId).filter(Boolean);
  if (orderLineIds.length > 0) {
    const orderSkuStatus = shipmentStatus === 'CANCELED' ? 'NEW' : shipmentStatus.toUpperCase();

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

  // --- 4️ Log updates ---
  const logEntry = createLogEntry(shipmentStatus, airWaybillNo, tracking, trackingInfo);
  if (logEntry) {
    await OrderLogs.updateOne({ orderId }, { $push: { details: logEntry } }, { upsert: true });
  }

  // --- 5️ Sync order-level status ---
  const updatedOrder = await Order.findById(orderId).lean();
  const allMatch = updatedOrder.orderSkuList?.skuList?.every((sku) => sku.status === shipmentStatus);

  if (allMatch) {
    const finalOrderStatus = shipmentStatus === 'SHIPMENT_CREATED' ? 'IN_PROGRESS' : shipmentStatus.toUpperCase();

    await Order.findByIdAndUpdate(orderId, { $set: { status: finalOrderStatus } });

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

    //Validate required fields
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

    // Fetch the order
    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    //Get user details for shipment merchant details
    const user = await User.findById(userId).lean();
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    //Validate products against order
    const orderSkuMap = new Map();
    if (order.orderSkuList?.skuList) {
      order.orderSkuList.skuList.forEach((sku) => {
        orderSkuMap.set(sku.merchantProductNo.toLowerCase(), sku);
      });
    }

    // Fetch existing shipments to calculate already shipped quantities
    const productLineIds = products.map((p) => p.orderLineId?.toString());
    const existingShipments = await Shipment.find({
      orderId: orderId,
      status: { $nin: ['CANCELED', 'RETURNED'] },
      'products.orderLineId': { $in: productLineIds },
    }).lean();

    // Build shipped quantity map
    const shippedQtyMap = {};
    for (const shipment of existingShipments || []) {
      for (const product of shipment.products || []) {
        const orderLineId = String(product.orderLineId);
        const quantity = product.quantity || 0;

        if (productLineIds.includes(orderLineId)) {
          shippedQtyMap[orderLineId] = (shippedQtyMap[orderLineId] || 0) + quantity;
        }
      }
    }

    const validatedProducts = [];
    for (const product of products) {
      const orderSku = orderSkuMap.get(product.merchantProductNo.toLowerCase());
      if (!orderSku) {
        throw new Error(`Product ${product.merchantProductNo} not found in order ${order.orderId}`);
      }

      // Check if quantity is valid
      if (product.quantity <= 0) {
        throw new Error(`Invalid quantity for product ${product.merchantProductNo}`);
      }

      // Calculate available quantity (ordered - cancelled)
      const orderedQuantity = orderSku.quantity || 0;
      const cancelledQuantity = orderSku.cancellationRequestedQuantity || 0;
      const availableQuantity = orderedQuantity - cancelledQuantity;

      // Get already shipped quantity for this product
      const orderLineId = String(product.orderLineId);
      const alreadyShippedQty = shippedQtyMap[orderLineId] || 0;
      const remainingQuantity = availableQuantity - alreadyShippedQty;

      // Validate requested quantity doesn't exceed remaining quantity
      if (remainingQuantity <= 0) {
        throw new Error(
          `Cannot ship ${product.merchantProductNo}. All ${availableQuantity} available units have already been shipped`
        );
      }

      if (product.quantity > remainingQuantity) {
        throw new Error(
          `Cannot ship ${product.quantity} units of ${product.merchantProductNo}. Only ${remainingQuantity} units remaining (${orderedQuantity} ordered, ${cancelledQuantity} cancelled, ${alreadyShippedQty} already shipped)`
        );
      }

      validatedProducts.push({
        merchantProductNo: product.merchantProductNo,
        orderLineId: product.orderLineId,
        quantity: product.quantity,
        hsCode: orderSku.hsCode || '',
      });
    }

    //Validate and get pickup address
    const pickupData = await getPickUpAddress(pickUpId);
    if (!pickupData) {
      throw new Error('Invalid pickup address ID');
    }

    //Save or get existing delivery address from order
    let deliveryId;
    const existingDelivery = await DeliveryAddress.findOne({
      orderId: orderId,
    }).lean();

    if (existingDelivery) {
      deliveryId = existingDelivery._id;
    } else {
      // Create delivery address from order shipping address
      const deliveryData = {
        orderId: orderId,
        name: `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim(),
        email: order.orderCustomer?.email || '',
        phone: order.orderCustomer?.phone || order.orderShippingAddress?.phone || '',
        address: order.orderShippingAddress?.streetName || '',
        city: order.orderShippingAddress?.city || '',
        country: order.orderShippingAddress?.country || '',
        postcode: order.orderShippingAddress?.zipCode || '',
      };

      const savedDelivery = await saveDeliveryAddress(deliveryData);
      deliveryId = savedDelivery._id;
    }

    //Calculate pieces (total quantity)
    const totalPieces = validatedProducts.reduce((sum, p) => sum + p.quantity, 0);

    //Create shipment in DB
    const shipmentDoc = new Shipment({
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
      isMerchantCreator: true,
      shipmentMethod: 'Manual',
      ...(description && { description }),
      shipmentMerchantDetails: {
        name: user.firstName || user.username || 'Unknown',
        email: user.email || '',
      },
    });

    const savedShipment = await shipmentDoc.save();

    //Prepare lines for ChannelEngine
    const channelEngineLines = validatedProducts.map((p) => ({
      merchantProductNo: p.merchantProductNo,
      quantity: p.quantity,
      orderLineId: p.orderLineId,
    }));

    //Send to ChannelEngine
    const channelEngineResponse = await createShipmentWithChannelEngine({
      merchantShipmentNo,
      merchantOrderNo: order.merchantOrderNo || order.orderId,
      lines: channelEngineLines,
      trackTraceNo: airWaybillNo,
      trackTraceUrl: trackTraceUrl || '',
      returnTrackTraceNo: '',
      method,
      shippedFromCountryCode,
      shipmentDate: new Date(),
      returnMethod: '',
      isMerchantCreator: true,
      airWaybillNo,
      extraData: {},
    });

    //Update order SKU statuses
    const orderLineIds = validatedProducts.map((p) => p.orderLineId);
    if (orderLineIds.length > 0) {
      await Order.updateOne(
        { _id: orderId, 'orderSkuList.skuList.id': { $in: orderLineIds } },
        {
          $set: {
            'orderSkuList.skuList.$[elem].status': 'SHIPPED',
          },
        },
        {
          arrayFilters: [{ 'elem.id': { $in: orderLineIds } }],
        }
      );
    }

    // Check if all SKUs are now SHIPPED and update order status
    const updatedOrder = await Order.findById(orderId).lean();
    const allShipped = updatedOrder.orderSkuList?.skuList?.every((sku) => sku.status === 'SHIPPED');

    if (allShipped) {
      await Order.findByIdAndUpdate(orderId, { $set: { status: 'SHIPPED' } });

      // Add order-level log entry
      const orderLogEntry = {
        status: 'SHIPPED',
        description: `All items shipped`,
        createdAt: convetDateToUTC(new Date()),
      };
      await OrderLogs.updateOne({ orderId: orderId }, { $push: { details: orderLogEntry } }, { upsert: true });
    }

    // Create shipment log entry
    const logEntry = {
      status: 'SHIPPED',
      description: `Manual shipment created with AWB: ${airWaybillNo}, Method: ${method}`,
      createdAt: convetDateToUTC(new Date()),
    };

    await OrderLogs.updateOne({ orderId: orderId }, { $push: { details: logEntry } }, { upsert: true });

    return {
      success: true,
      message: 'Manual shipment created successfully',
      shipmentId: savedShipment._id,
      airWaybillNo,
      merchantShipmentNo,
      channelEngineResponse,
    };
  } catch (error) {
    console.error('Error in createManualShipmentService:', error.message, error.stack);
    throw new Error(error.message || 'Failed to create manual shipment');
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
  getSingleShipmentService,
  syncShipmentStatus,
  cancelShipmentService,
  transformShipmentResponse,
  formatShipmentTrackingInfo,
  createManualShipmentService,
};
