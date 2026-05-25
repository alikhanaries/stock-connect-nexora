import mongoose from 'mongoose';
import Return from '../models/Return.js';
import Channel from '#root/src/models/Channel.js';
import Product from '#root/src/models/Product.js';
import { RETURN_STATUS } from '#root/src/constants/common.js';
export const isNameOrEmailSearch = (searchTerm) => {
  if (!searchTerm) return false;

  const emailPattern = /@/;
  if (emailPattern.test(searchTerm)) return true;

  const namePattern = /[a-zA-Z]/;
  if (namePattern.test(searchTerm)) {
    const isLikelyId =
      /^[0-9]+$/.test(searchTerm.trim()) || (/^[A-Z0-9]+$/i.test(searchTerm.trim()) && searchTerm.length >= 5);
    return !isLikelyId;
  }

  return false;
};

// Optimized helper function to find order data by orderLineIds
export const getOrderDataByOrderLineIds = async (orderLineIds, Order, projection = { orderId: 1 }) => {
  try {
    if (!orderLineIds || orderLineIds.length === 0) {
      return null;
    }

    const order = await Order.findOne({ 'orderSkuList.skuList.id': { $in: orderLineIds } }, projection).lean();

    return order;
  } catch (error) {
    console.error('Error finding order data by orderLineIds:', error.message);
    return null;
  }
};

export const sanitizeReturnData = async (returnData, OrderModel = null) => {
  try {
    if (!returnData) {
      throw new Error('Return data is required');
    }

    const returnId = returnData.Id?.toString();

    // Collect all SKU codes
    const skuCodes = Array.isArray(returnData.Lines)
      ? returnData.Lines.map((line) => line?.MerchantProductNo).filter(Boolean)
      : [];

    // Run DB calls in parallel
    const [existingReturn, orderData, productDocs] = await Promise.all([
      Return.findOne({ returnId }, { sellerStatuses: 1 }).lean(),

      OrderModel && returnData.MerchantOrderNo
        ? OrderModel.findOne({
            merchantOrderNo: returnData.MerchantOrderNo,
          }).lean()
        : null,

      Product.find(
        {
          productSkuCode: { $in: skuCodes },
        },
        {
          productSkuCode: 1,
          sellerId: 1,
          brand: 1,
        }
      ).lean(),
    ]);

    // Build SKU -> sellerId map
    const skuSellerMap = new Map();

    for (const product of productDocs) {
      if (product?.productSkuCode && product?.sellerId) {
        skuSellerMap.set(String(product.productSkuCode), String(product.sellerId));
      }
    }

    const sellerIdSet = new Set();

    // Build products array
    let products = Array.isArray(returnData.Lines)
      ? returnData.Lines.reduce((acc, line) => {
          const skuCode = String(line?.MerchantProductNo || '');

          const sellerId = skuSellerMap.get(skuCode);

          // Ignore invalid SKU
          if (!sellerId) {
            return acc;
          }

          sellerIdSet.add(sellerId);

          const productObj = {
            productSkuCode: skuCode,
            orderLineId: line.OrderLine?.Id || null,
            quantity: line.Quantity || 0,
            acceptedQuantity: line.AcceptedQuantity || 0,
            rejectedQuantity: line.RejectedQuantity || 0,
            price: line.OrderLine?.UnitPriceInclVat || 0,
            sellerId,
          };

          acc.push(productObj);

          return acc;
        }, [])
      : [];

    // Ignore complete return if no products found
    if (!products.length) {
      return {
        success: false,
        ignored: true,
        message: 'No matching products found in products collection',
      };
    }

    // Existing seller status map
    const existingStatusMap = new Map((existingReturn?.sellerStatuses || []).map((s) => [String(s.sellerId), s]));

    // Build sellerStatuses
    const sellerStatuses = [];

    for (const sellerId of sellerIdSet) {
      const existing = existingStatusMap.get(String(sellerId));

      if (existing && existing.status !== 'IN_PROGRESS') {
        sellerStatuses.push(existing);
      } else {
        const newStatus = {
          sellerId,
          status: returnData.Status,
        };

        sellerStatuses.push(newStatus);
      }
    }

    const sanitizedData = {
      returnId,
      reason: returnData.Reason || '',
      customerComment: returnData.CustomerComment || '',
      merchantComment: returnData.MerchantComment || '',
      merchantReturnNo: returnData.MerchantReturnNo,
      merchantOrderNo: returnData.MerchantOrderNo,
      channelOrderNo: returnData.ChannelOrderNo,
      channelReturnNo: returnData.ChannelReturnNo,
      channelId: returnData.ChannelId,
      orderId: orderData?.orderId || null,

      sellerIds: Array.from(sellerIdSet),

      status: returnData.Status,

      sellerStatuses,

      totalPrice: returnData.RefundInclVat || 0,

      placedOn: returnData.CreatedAt ? new Date(returnData.CreatedAt) : null,

      acknowledgeDate: returnData.AcknowledgedDate ? new Date(returnData.AcknowledgedDate) : null,

      platform: returnData.ChannelName,

      products,

      returnDate: returnData?.ReturnDate || null,
    };

    return {
      success: true,
      data: sanitizedData,
    };
  } catch (error) {
    console.error('Error sanitizing return data:', error);

    return {
      success: false,
      message: `Error sanitizing return data: ${error.message}`,
      error: error.message,
    };
  }
};

export const buildReturnAggregationPipeline = () => {
  return [
    {
      $lookup: {
        from: 'channelengineorders',
        let: { orderLineIds: '$products.orderLineId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $gt: [
                  {
                    $size: {
                      $ifNull: [
                        {
                          $filter: {
                            input: '$orderSkuList.skuList',
                            cond: { $in: ['$$this.id', { $ifNull: ['$$orderLineIds', []] }] },
                          },
                        },
                        [],
                      ],
                    },
                  },
                  0,
                ],
              },
            },
          },
        ],
        as: 'orderData',
      },
    },
    {
      $addFields: {
        orderInfo: { $arrayElemAt: ['$orderData', 0] },
        totalQuantity: {
          $reduce: {
            input: '$products',
            initialValue: 0,
            in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
          },
        },
      },
    },
    {
      $lookup: {
        from: 'shipments',
        let: { shipment_ids: '$shipmentId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $in: ['$_id', { $ifNull: ['$$shipment_ids', []] }] }],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 }, // only get last shipment
          {
            $project: {
              airWaybillNo: 1,
              merchantShipmentNo: 1,
              status: 1,
              createdAt: 1,
              _id: 0,
              deliveryId: 1,
              pickUpId: 1,
            },
          },
        ],
        as: 'shipmentData',
      },
    },
    {
      $unwind: {
        path: '$shipmentData',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        returnId: 1,
        merchantReturnNo: 1,
        merchantOrderNo: 1,
        channelOrderNo: 1,
        channelReturnNo: 1,
        channelId: 1,
        orderId: 1,
        reason: 1,
        customerComment: 1,
        merchantComment: 1,
        placedOn: 1,
        acknowledgeDate: 1,
        platform: 1,
        products: 1,
        status: 1,
        totalPrice: 1,
        totalQuantity: 1,
        createdAt: 1,
        updatedAt: 1,
        orderInfo: 1,
        shipmentData: 1,
        sellerIds: 1,
        sellerStatuses: 1,
      },
    },
  ];
};

export const addFilter = (matchConditions, key, value, transform = (v) => v) => {
  if (value !== undefined && value !== null && value !== '') {
    matchConditions[key] = transform(value);
  }
};

export const buildReturnMatchAndPipeline = async (query = {}) => {
  const { status, returnId, orderID, search, dateFrom, dateTo, sellerId } = query;

  const matchConditions = {};

  // Validate status if provided
  if (status) {
    const statusArray = status
      .toString()
      .split(',')
      .map((s) => s.trim().toUpperCase());

    // Check each provided status
    const invalid = statusArray.filter((s) => !Object.values(RETURN_STATUS).includes(s));

    if (invalid.length > 0) {
      throw new Error(
        `Invalid status: ${invalid.join(', ')}. Valid statuses are: ${Object.values(RETURN_STATUS).join(', ')}`
      );
    }
  }

  // Filters
  addFilter(matchConditions, 'status', status, (v) => ({
    $in: v.split(',').map((s) => new RegExp(`^${s.trim()}$`, 'i')),
  }));

  addFilter(matchConditions, 'returnId', returnId);
  addFilter(matchConditions, 'orderId', orderID);

  // Date filter
  if (dateFrom || dateTo) {
    matchConditions.createdAt = {};
    if (dateFrom) matchConditions.createdAt.$gte = new Date(dateFrom);
    if (dateTo) matchConditions.createdAt.$lte = new Date(dateTo);
  }

  // Seller filter (return document level)
  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    const sellerObjectId = new mongoose.Types.ObjectId(String(sellerId));

    matchConditions.$or = [
      { sellerIds: sellerObjectId },
      { sellerIds: { $exists: false } }, // support old records
    ];
  }

  // Start pipeline
  const pipeline = [];

  if (Object.keys(matchConditions).length > 0) {
    pipeline.push({ $match: matchConditions });
  }

  // Main aggregation pipeline
  pipeline.push(...buildReturnAggregationPipeline());

  // Search filter (after lookup because it uses orderInfo)
  if (search) {
    const searchRegex = new RegExp(search, 'i');

    //  Fetch matching channelIds
    const matchingChannels = await Channel.find({
      channelName: { $regex: searchRegex },
    })
      .select('channelId')
      .lean();

    const channelIdsFromSearch = matchingChannels.map((c) => c.channelId);

    const searchConditions = [
      { returnId: { $regex: searchRegex } },
      { orderId: { $regex: searchRegex } },

      //  Channel name → channelId mapping
      ...(channelIdsFromSearch.length ? [{ channelId: { $in: channelIdsFromSearch } }] : []),

      { 'orderInfo.orderCustomer.firstName': { $regex: searchRegex } },
      { 'orderInfo.orderCustomer.lastName': { $regex: searchRegex } },
      { 'orderInfo.orderCustomer.email': { $regex: searchRegex } },
    ];

    const searchTerms = search.trim().split(/\s+/);
    if (searchTerms.length > 1) {
      const [firstTerm, ...rest] = searchTerms;
      const lastTerm = rest.join(' ');
      const firstRegex = new RegExp(firstTerm, 'i');
      const lastRegex = new RegExp(lastTerm, 'i');

      searchConditions.push(
        {
          $and: [
            { 'orderInfo.orderCustomer.firstName': firstRegex },
            { 'orderInfo.orderCustomer.lastName': lastRegex },
          ],
        },
        {
          $and: [
            { 'orderInfo.orderCustomer.lastName': firstRegex },
            { 'orderInfo.orderCustomer.firstName': lastRegex },
          ],
        }
      );
    }

    pipeline.push({
      $match: {
        $or: searchConditions,
      },
    });
  }

  return { pipeline, matchConditions };
};

export const addStatusManipulationStages = () => {
  return [
    {
      $addFields: {
        totalAcceptedQuantity: {
          $sum: {
            $map: {
              input: '$products',
              as: 'p',
              in: { $ifNull: ['$$p.acceptedQuantity', 0] },
            },
          },
        },
        totalRejectedQuantity: {
          $sum: {
            $map: {
              input: '$products',
              as: 'p',
              in: { $ifNull: ['$$p.rejectedQuantity', 0] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $eq: ['$status', 'IN_PROGRESS'] },
                    { $eq: ['$totalAcceptedQuantity', 0] },
                    { $eq: ['$totalRejectedQuantity', 0] },
                  ],
                },
                then: 'RETURN_REQUESTED',
              },
              {
                case: {
                  $and: [{ $in: ['$status', ['IN_PROGRESS', 'RECEIVED']] }, { $gt: ['$totalAcceptedQuantity', 0] }],
                },
                then: 'REQUEST_ACCEPTED',
              },
              {
                case: {
                  $and: [{ $in: ['$status', ['IN_PROGRESS', 'RECEIVED']] }, { $gt: ['$totalRejectedQuantity', 0] }],
                },
                then: 'REQUEST_REJECTED',
              },
            ],
            default: '$status',
          },
        },
      },
    },
  ];
};

export const formatReturnDetails = (aggregatedResult, imageMap = {}) => {
  if (!aggregatedResult) {
    return null;
  }

  const returnData = aggregatedResult;
  const orderInfo = aggregatedResult.orderInfo;

  // Build product image map (O(n))
  const productMap = {};
  (returnData.productData || []).forEach((p) => {
    productMap[p.productSkuCode] = p;
  });

  if (!orderInfo) {
    return {
      _id: returnData._id,
      returnId: returnData.returnId || null,
      orderId: null,
      orderDbId: null,
      paymentInfo: {
        channelName: returnData.platform || null,
        paymentMethod: null,
        currencyCode: null,
      },
      customerInfo: {
        name: null,
        email: null,
        phoneNo: null,
      },
      shippingAddress: {
        address: 'NA',
        city: 'NA',
        region: 'NA',
        zipCode: 'NA',
      },
      products:
        returnData.products?.map((product, index) => ({
          id: index + 1,
          orderLineId: product.orderLineId,
          merchantProductNo: product.productSkuCode,
          channelProductNo: null,
          name: 'Product',
          imageUrl: imageMap[product.productSkuCode] ?? null,
          unitPriceInclVat: 0,
          unitPriceExclVat: 0,
          unitVat: 0,
          lineTotalInclVat: 0,
          lineTotalExclVat: 0,
          lineVat: 0,
          quantity: product.quantity || 0,
          acceptedQuantity: product.acceptedQuantity || 0,
          rejectedQuantity: product.rejectedQuantity || 0,
        })) || [],
      omniful: returnData.omniful || null,
      status: returnData.status || 'UNKNOWN',
      subtotal: 0,
      tax: 0,
      total: 0,
      shippingFee: 0,
      trackingNumber: null,
      shipmentStatus: null,
      logsDetails: returnData?.returnLogsData || [],
      orderLogsData: returnData?.returnLogsData || [],
    };
  }

  const returnedSkus = returnData.products || [];
  const orderSkus = orderInfo.orderSkuList?.skuList || [];

  let subtotal = 0;
  let tax = 0;

  const products = returnedSkus.map((returnProduct, index) => {
    const matchingSku = orderSkus.find((sku) => Number(sku.id) === Number(returnProduct.orderLineId));

    const quantity = returnProduct.quantity || 0;

    const unitPriceExclVat = matchingSku?.unitPriceExclVat || matchingSku?.lineTotalInclVat || 0;
    const unitVat = matchingSku?.unitVat || 0;
    const unitPriceInclVat = unitPriceExclVat + unitVat;

    const lineTotalExclVat = unitPriceExclVat * quantity;
    const lineVat = unitVat * quantity;
    const lineTotalInclVat = unitPriceInclVat * quantity;

    subtotal += lineTotalExclVat;
    tax += lineVat;

    // Get image from productMap
    const productMatch = productMap[returnProduct.productSkuCode];

    const imageUrl = productMatch?.primaryImageUrl || productMatch?.imageUrl || productMatch?.images?.[0] || null;

    return {
      id: index + 1,
      orderLineId: returnProduct.orderLineId,
      merchantProductNo: returnProduct.productSkuCode,
      channelProductNo: matchingSku?.channelProductNo || null,
      name: matchingSku?.description || 'Product',
      imageUrl,
      unitPriceInclVat,
      unitPriceExclVat,
      unitVat,
      lineTotalInclVat,
      lineTotalExclVat,
      lineVat,
      quantity,
      acceptedQuantity: returnProduct.acceptedQuantity || 0,
      rejectedQuantity: returnProduct.rejectedQuantity || 0,
      sellerId: returnProduct.sellerId || null,
    };
  });

  // Seller-safe shipping logic (optional)
  let shippingFee = 0;
  const total = subtotal + tax + shippingFee;

  const shippingAddress = orderInfo.orderShippingAddress
    ? {
        address: [orderInfo.orderShippingAddress.line1].filter(Boolean).join(' '),
        city: orderInfo.orderShippingAddress.city || '',
        region: orderInfo.orderShippingAddress.region || '',
        zipCode: orderInfo.orderShippingAddress.zipCode || '',
        country: orderInfo.orderShippingAddress.countryIso || '',
      }
    : {
        address: '',
        city: '',
        region: '',
        zipCode: '',
        country: '',
      };

  return {
    _id: returnData._id,
    returnId: returnData.returnId || null,
    reason: returnData.reason || null,
    customerComment: returnData.customerComment || null,
    merchantComment: returnData.merchantComment || null,
    orderId: orderInfo.orderId || null,
    orderDbId: orderInfo._id || null,
    paymentInfo: {
      channelName: returnData.platform || orderInfo.channelName || null,
      paymentMethod: orderInfo.orderPaymentDetails?.paymentMethod || null,
      currencyCode: orderInfo.orderPaymentDetails?.currencyCode || 'SAR',
    },
    customerInfo: {
      name: orderInfo.orderCustomer
        ? `${orderInfo.orderCustomer.firstName || ''} ${orderInfo.orderCustomer.lastName || ''}`.trim() || null
        : null,
      email: orderInfo.orderCustomer?.email || null,
      phoneNo: orderInfo.orderCustomer?.phone || null,
    },
    shippingAddress,
    products,
    omniful: returnData.omniful || null,
    status: returnData.status || 'UNKNOWN',
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    shippingFee: parseFloat(shippingFee.toFixed(2)),
    trackingNumber: returnData?.shipmentData?.airWaybillNo || null,
    shipmentStatus: returnData?.shipmentData?.status,
    logsDetails: returnData?.returnLogsData,
    orderLogsData: returnData?.returnLogsData,
  };
};

export default {
  sanitizeReturnData,
  getOrderDataByOrderLineIds,
  isNameOrEmailSearch,
  buildReturnAggregationPipeline,
  buildReturnMatchAndPipeline,
  addStatusManipulationStages,
  formatReturnDetails,
};
