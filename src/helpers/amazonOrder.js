import pLimit from 'p-limit';
import csv from 'csv-parser';
import fs from 'fs';
import { AMAZON_STATUS_MAP, ORDER_STATUS_MAP } from '../constants/common.js';
import Order from '../models/Orders.js';
import Seller from '../models/Seller.js';
import Channel from '../models/Channel.js';
import Product from '../models/Product.js';

const ROW_CONCURRENCY = 50;
const limit = pLimit(ROW_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;
const MAX_ERRORS = 1000;

export const mapRowToAmazonOrders = (row, rowNumber, locale) => {
  if (!row || typeof row !== 'object') {
    return {
      rowNumber,
      errorData: [locale.INVALID_ROW_DATA || 'Invalid row data'],
    };
  }

  // Normalize keys
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase().trim()] = value === undefined || value === null ? '' : String(value).trim();
  }

  const errors = [];

  const requiredFields = [
    'orderid',
    'orderitemid',
    'purchasedate',
    'paymentsdate',
    'buyeremail',
    'sku',
    'productname',
    'currency',
    'shipservicelevel',
    'orderstatus',
    'brandname',
  ];

  for (const field of requiredFields) {
    if (!normalized[field]) {
      errors.push(`${field} missing for row ${rowNumber}`);
    }
  }

  const quantity = Number(normalized.quantitypurchased);
  if (normalized.quantitypurchased && (Number.isNaN(quantity) || quantity < 0)) {
    errors.push(locale.INVALID_QUANTITY || 'Invalid quantity');
  }

  const itemPrice = Number(normalized.itemprice);
  if (normalized.itemprice && (Number.isNaN(itemPrice) || itemPrice < 0)) {
    errors.push(locale.INVALID_PRICE || 'Invalid price');
  }

  if (errors.length) {
    return { rowNumber, errorData: errors };
  }

  const parseOptionalNumber = (value, fieldName) => {
    if (!value) return undefined;
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) {
      errors.push(`Invalid ${fieldName} for order ${normalized.orderid}`);
      return undefined;
    }
    return num;
  };

  const itemTax = parseOptionalNumber(normalized.itemtax, 'itemTax');
  const shippingPrice = parseOptionalNumber(normalized.shippingprice, 'shippingPrice');
  const shippingTax = parseOptionalNumber(normalized.shippingtax, 'shippingTax');
  const paymentMethodFee = parseOptionalNumber(normalized.paymentmethodfee, 'paymentMethodFee');

  if (errors.length) {
    return { rowNumber, errorData: errors };
  }

  return {
    rowNumber,
    orderId: normalized.orderid,
    orderItemId: normalized.orderitemid,
    purchaseDate: normalized.purchasedate,
    paymentDate: normalized.paymentsdate,
    buyerEmail: normalized.buyeremail,
    buyerName: normalized.buyername || '',
    buyerPhoneNumber: normalized.buyerphonenumber || '',
    sku: normalized.sku,
    productName: normalized.productname,
    brandName: normalized.brandname || '',
    quantityPurchased: normalized.quantitypurchased || '0',
    currency: normalized.currency,
    itemPrice: normalized.itemprice || '0',
    itemTax: itemTax ?? 0,
    shippingPrice: shippingPrice ?? 0,
    shippingTax: shippingTax ?? 0,
    shipServiceLevel: normalized.shipservicelevel,
    recipientName: normalized.recipientname || '',
    shipAddress1: normalized.shipaddress1 || '',
    shipAddress2: normalized.shipaddress2 || '',
    shipAddress3: normalized.shipaddress3 || '',
    shipCity: normalized.shipcity || '',
    shipState: normalized.shipstate || '',
    shipCounty: normalized.shipcounty || '',
    shipPostalCode: normalized.shippostalcode || '',
    shipCountry: normalized.shipcountry || 'SA',
    shipPhoneNumber: normalized.shipphonenumber || '',
    deliveryStartDate: normalized.deliverystartdate || '',
    deliveryEndDate: normalized.deliveryenddate || '',
    deliveryTimezone: normalized.deliverytimezone || '',
    deliveryInstructions: normalized.deliveryinstructions || '',
    orderStatus: normalized.orderstatus,
    paymentMethod: normalized.paymentmethod || '',
    codCollectibleAmount: normalized.codcollectibleamount || '',
    alreadPaid: normalized.alreadpaid || '',
    paymentMethodFee: paymentMethodFee ?? 0,
  };
};

export const processAmazonOrderImportStream = async (
  stream,
  { deleteAfter = false, filePath, locale, sellerId } = {}
) => {
  if (!stream || !sellerId || !locale) {
    throw new Error('Invalid import request');
  }

  let rowIndex = 0;
  let invalidRowsCount = 0;
  let aborted = false;

  const validOrders = [];
  const errorDetails = [];

  const pushError = (err) => {
    if (errorDetails.length < MAX_ERRORS) {
      errorDetails.push(err);
    }
  };

  await new Promise((resolve, reject) => {
    let rowBuffer = [];

    stream
      .pipe(csv())
      .on('data', (row) => {
        if (aborted) return;

        rowIndex++;
        const rowNumber = rowIndex;

        if (rowIndex > MAX_ROWS) {
          aborted = true;
          stream.destroy();
          return reject(new Error('CSV row limit exceeded'));
        }

        rowBuffer.push({ row, rowNumber });

        if (rowBuffer.length >= BATCH_SIZE) {
          stream.pause();
          processRowChunk(rowBuffer)
            .then(() => {
              rowBuffer = [];
              stream.resume();
            })
            .catch(reject);
        }
      })
      .on('end', async () => {
        if (rowBuffer.length) {
          await processRowChunk(rowBuffer);
        }
        resolve();
      })
      .on('error', reject);
  });

  async function processRowChunk(rows) {
    await Promise.all(
      rows.map(({ row, rowNumber }) =>
        limit(async () => {
          try {
            if (Object.values(row).every((v) => !v || String(v).trim() === '')) {
              invalidRowsCount++;
              pushError({
                rowNumber,
                errorData: [locale.EMPTY_ROW || 'Empty row'],
              });
              return;
            }

            const order = mapRowToAmazonOrders(row, rowNumber, locale);
            if (order?.errorData) {
              invalidRowsCount++;
              pushError(order);
              return;
            }

            validOrders.push(order);
          } catch {
            invalidRowsCount++;
            pushError({
              rowNumber,
              errorData: ['Row processing failed'],
            });
          }
        })
      )
    );
  }

  if (deleteAfter && filePath) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('File cleanup failed:', err.message);
    });
  }

  return {
    success: true,
    invalidRowsCount,
    data: validOrders,
    errors: errorDetails,
  };
};

export const sanitizeAmazonOrdersData = async (orders) => {
  const orderMap = new Map();

  orders.forEach((row) => {
    const orderId = row.orderId;
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        orderInfo: row,
        items: [],
      });
    }
    orderMap.get(orderId).items.push(row);
  });

  const orderIds = Array.from(orderMap.keys());

  const skuSet = new Set();
  orders.forEach((row) => {
    if (row.sku) {
      skuSet.add(row.sku.trim());
    }
  });
  const productDocs = await Product.find({
    productSkuCode: {
      $in: Array.from(skuSet).map((sku) => sku.trim()),
    },
  })
    .select('productSkuCode sellerId')
    .lean();

  const productSellerMap = new Map();

  productDocs.forEach((product) => {
    productSellerMap.set(product.productSkuCode, product.sellerId);
  });

  const brandNameSet = new Set();
  orders.forEach((row) => {
    if (row.brandName) brandNameSet.add(row.brandName.toLowerCase().trim());
  });

  const brandOrQuery =
    brandNameSet.size > 0
      ? Array.from(brandNameSet).map((brand) => ({
          name: { $regex: new RegExp(`^${brand}$`, 'i') },
        }))
      : [{ _id: null }];

  const [existingOrdersDb, sellersDb, amazonChannel] = await Promise.all([
    Order.find({ orderId: { $in: orderIds } }).lean(),
    Seller.find({
      $or: brandOrQuery,
      isDeleted: false,
    })
      .select('_id name')
      .lean(),
    Channel.findOne({ globalChannelId: 1635 }).select('channelId channelName globalChannelId globalChannelName').lean(),
  ]);

  const channelInfo = amazonChannel || {
    channelId: amazonChannel.channelId,
    channelName: 'Amazon.sa (v3)',
    globalChannelId: 1635,
    globalChannelName: 'Amazon',
  };

  const existingOrdersMap = new Map(existingOrdersDb.map((o) => [o.orderId, o]));

  const brandSellerMap = new Map();
  sellersDb.forEach((seller) => {
    brandSellerMap.set(seller.name.toLowerCase().trim(), seller._id);
  });

  const operations = [];

  for (const [orderId, orderData] of orderMap) {
    const { orderInfo, items } = orderData;
    const existingOrder = existingOrdersMap.get(orderId);

    const purchaseDate = parseAmazonDate(orderInfo.purchaseDate);

    let totalPrice = 0;
    let totalTax = 0;
    let totalShipping = 0;

    items.forEach((item) => {
      totalPrice += parseFloat(item.itemPrice) || 0;
      totalTax += parseFloat(item.itemTax) || 0;
      totalShipping += parseFloat(item.shippingPrice) || 0;
    });
    const sellerIDsSet = new Set();

    const skuList = items.map((item, index) => {
      const skuSellerId = productSellerMap.get(item.sku?.trim()) || null;

      if (skuSellerId) {
        sellerIDsSet.add(String(skuSellerId));
      }
      const existingSku = existingOrder?.orderSkuList?.skuList?.find(
        (s) => s.id === item.orderItemId || s.merchantProductNo === item.sku?.trim()
      );
      const qty = parseInt(item.quantityPurchased) || 1;
      const mappedStatus = existingSku?.status || mapAmazonStatus(item.orderStatus);

      const statusBreakdown = existingSku?.statusBreakdown ?? buildAmazonStatusBreakdown(mappedStatus, qty);

      return {
        sellerId: skuSellerId,
        id: item.orderItemId || `${orderId}-${index}`,
        channelOrderLineNo: item.orderItemId,
        status: mappedStatus,
        statusBreakdown,
        isFulfillmentByMarketplace: false,
        gtin: null,
        description: item.productName,
        stockLocation: null,
        unitVat: parseFloat(item.itemTax) || 0,
        lineTotalInclVat: parseFloat(item.itemPrice) || 0,
        lineVat: parseFloat(item.itemTax) || 0,
        originalUnitPriceInclVat: parseFloat(item.itemPrice) || 0,
        originalUnitVat: parseFloat(item.itemTax) || 0,
        originalLineTotalInclVat: parseFloat(item.itemPrice) || 0,
        originalLineVat: parseFloat(item.itemTax) || 0,
        originalFeeFixed: 0,
        bundleProductMerchantProductNo: null,
        bundleOrderLineId: null,
        jurisCode: null,
        jurisName: null,
        vatRate: 0,
        unitPriceExclVat: parseFloat(item.itemPrice) || 0,
        lineTotalExclVat: parseFloat(item.itemPrice) || 0,
        originalUnitPriceExclVat: parseFloat(item.itemPrice) || 0,
        originalLineTotalExclVat: parseFloat(item.itemPrice) || 0,
        extraData: null,
        channelProductNo: item.orderItemId,
        merchantProductNo: item.sku?.trim(),
        quantity: qty,
        cancellationRequestedQuantity: existingSku?.cancellationRequestedQuantity || 0,
        unitPriceInclVat: parseFloat(item.itemPrice) || 0,
        feeFixed: parseFloat(item.paymentMethodFee) || 0,
        feeRate: 0,
        condition: null,
        exactDeliveryDate: null,
        expectedDeliveryDate: item.deliveryEndDate ? new Date(item.deliveryEndDate) : null,
        latestDeliveryDate: null,
        exactShipmentDate: null,
        expectedShipmentDate: null,
        latestShipmentDate: null,
        airWaybillNo: existingSku?.airWaybillNo || null,
      };
    });

    const incomingStatus = mapAmazonStatus(orderInfo.orderStatus);
    const finalStatus = resolveStatus({
      existingStatus: existingOrder?.status,
      incomingStatus,
    });

    const updatePayload = {
      orderId: orderId,
      channelOrderNumber: orderId,
      channelId: channelInfo.channelId,
      sellerIds: Array.from(sellerIDsSet),
      channelName: channelInfo.channelName,
      globalChannelName: channelInfo.globalChannelName,
      globalChannelId: channelInfo.globalChannelId,
      orderDate: purchaseDate,
      merchantComment: null,
      merchantOrderNo: `${channelInfo.globalChannelId}-${orderId}`,
      isBusinessOrder: false,
      subTotalInclVat: totalPrice,
      subTotalVat: totalTax,
      shippingCostsInclVat: totalShipping,
      totalInclVat: totalPrice + totalShipping,
      totalVat: totalTax,
      originalSubTotalInclVat: totalPrice,
      originalSubTotalVat: totalTax,
      originalShippingCostsInclVat: totalShipping,
      originalShippingCostsVat: 0,
      originalTotalInclVat: totalPrice + totalShipping,
      originalTotalVat: totalTax,
      subTotalExclVat: totalPrice - totalTax,
      totalExclVat: totalPrice + totalShipping - totalTax,
      shippingCostsExclVat: totalShipping,
      originalSubTotalExclVat: totalPrice - totalTax,
      originalShippingCostsExclVat: totalShipping,
      originalTotalExclVat: totalPrice + totalShipping - totalTax,
      originalSubTotalFee: 0,
      subTotalFee: 0,
      originalOrderFee: 0,
      orderFee: 0,
      originalTotalFee: 0,
      totalFee: 0,
      status: finalStatus,
      orderCustomer: {
        orderId: orderId,
        gender: null,
        firstName: orderInfo.buyerName?.split(' ')[0] || '',
        lastName: orderInfo.buyerName?.split(' ').slice(1).join(' ') || '',
        phone: orderInfo.buyerPhoneNumber || orderInfo.shipPhoneNumber || '',
        email: orderInfo.buyerEmail || '',
        languageCode: null,
        companyRegistrationNo: null,
        channelCustomerNo: null,
      },
      orderPaymentDetails: {
        orderId: orderId,
        vatNo: null,
        paymentMethod: orderInfo.paymentMethod || 'Amazon',
        paymentReferenceNo: null,
        currencyCode: orderInfo.currency || 'SAR',
      },
      orderSkuList: {
        orderId: orderId,
        skuList,
      },
      orderShippingAddress: {
        line1: orderInfo.shipAddress1 || '',
        line2: orderInfo.shipAddress2 || '',
        line3: orderInfo.shipAddress3 || '',
        gender: null,
        companyName: null,
        firstName: orderInfo.recipientName?.split(' ')[0] || '',
        lastName: orderInfo.recipientName?.split(' ').slice(1).join(' ') || '',
        streetName: orderInfo.shipAddress1 || '',
        houseNr: orderInfo.shipAddress2 || '',
        houseNrAddition: null,
        zipCode: orderInfo.shipPostalCode || '',
        city: orderInfo.shipCity || '',
        region: orderInfo.shipState || '',
        countryIso: orderInfo.shipCountry || 'SA',
      },
      orderBillingAddress: {
        line1: orderInfo.shipAddress1 || '',
        line2: orderInfo.shipAddress2 || '',
        line3: orderInfo.shipAddress3 || '',
        gender: null,
        companyName: null,
        firstName: orderInfo.buyerName?.split(' ')[0] || '',
        lastName: orderInfo.buyerName?.split(' ').slice(1).join(' ') || '',
        streetName: orderInfo.shipAddress1 || '',
        houseNr: orderInfo.shipAddress2 || '',
        houseNrAddition: null,
        zipCode: orderInfo.shipPostalCode || '',
        city: orderInfo.shipCity || '',
        region: orderInfo.shipState || '',
        countryIso: orderInfo.shipCountry || 'SA',
      },
    };

    operations.push({
      updateOne: {
        filter: { orderId: orderId },
        update: { $set: updatePayload },
        upsert: true,
      },
    });
  }

  console.log('Total operations to execute:', operations.length);
  return operations;
};

const parseAmazonDate = (dateStr) => {
  if (!dateStr) return new Date();

  try {
    const parts = dateStr.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '0:00';

    const [month, day, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    const fullYear = year < 100 ? 2000 + year : year;

    return new Date(fullYear, month - 1, day, hour, minute);
  } catch {
    return new Date();
  }
};

const mapAmazonStatus = (amazonStatus) => {
  if (!amazonStatus) return 'NEW';
  return AMAZON_STATUS_MAP[amazonStatus] || 'NEW';
};

const buildAmazonStatusBreakdown = (status, qty) => {
  const empty = {
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    returned: 0,
    canceled: 0,
    shipmentCreated: 0,
  };

  switch (status) {
    case 'NEW':
    case 'IN_PROGRESS':
    case 'PENDING':
      return { ...empty, confirmed: qty };
    case 'SHIPPED':
      return { ...empty, shipped: qty };
    case 'DELIVERED':
      return { ...empty, delivered: qty };
    case 'RETURNED':
      return { ...empty, returned: qty };
    case 'CANCELED':
      return { ...empty, canceled: qty };
    default:
      return { ...empty, confirmed: qty };
  }
};

const resolveStatus = ({ existingStatus, incomingStatus }) => {
  // Highest priority
  if (incomingStatus === ORDER_STATUS_MAP.MANCO) {
    return ORDER_STATUS_MAP.CANCELED;
  }

  // Allow explicit close
  if (incomingStatus === ORDER_STATUS_MAP.CLOSED) {
    return ORDER_STATUS_MAP.CLOSED;
  }

  // IN_COMBI always moves to IN_PROGRESS
  if (incomingStatus === ORDER_STATUS_MAP.IN_COMBI) {
    return ORDER_STATUS_MAP.IN_PROGRESS;
  }

  // Default behavior
  return existingStatus ?? incomingStatus;
};
