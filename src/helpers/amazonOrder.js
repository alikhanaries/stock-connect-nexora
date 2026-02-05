import pLimit from 'p-limit';
import csv from 'csv-parser';
import fs from 'fs';
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
