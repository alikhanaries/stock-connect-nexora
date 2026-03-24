import { formatDateTime } from './Common.js';

export const escapeCsv = (row) => {
  return row
    .map((field) => {
      if (field === null || field === undefined || field === '') return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
};

export const generateCSVFilename = (type) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${type}-export-${timestamp}.csv`;
};

export const validateExportData = (data, type) => {
  if (!Array.isArray(data)) {
    return {
      success: false,
      message: `Invalid ${type} data: expected array`,
    };
  }

  if (data.length === 0) {
    return {
      success: false,
      message: `No ${type} found to export`,
    };
  }

  return { success: true };
};

export const createCSVExportResponse = (csvRows, filename, count) => {
  return {
    success: true,
    data: csvRows.join('\n'),
    filename,
    recordCount: count,
    message: `Successfully exported ${count} records`,
  };
};

export const handleExportError = (error, type) => {
  console.error(`Export error for ${type}:`, error);
  return {
    success: false,
    message: `Failed to export ${type}: ${error.message}`,
    error: error.message,
  };
};

export const generateDynamicHeaders = (model, excludeFields = []) => {
  const schema = model.schema;
  const paths = schema.paths;
  const headers = [];

  // Standard exclusions for internal fields
  const defaultExclusions = ['__v', '_id'];
  const allExclusions = [...defaultExclusions, ...excludeFields];

  Object.keys(paths).forEach((path) => {
    // Skip excluded fields and nested array paths
    if (allExclusions.includes(path) || path.includes('.$')) {
      return;
    }

    // Use field name as header directly
    headers.push(path);
  });

  // Filter out timestamps and organize headers
  const finalHeaders = headers.filter((h) => !['createdAt', 'updatedAt'].includes(h));

  // Add timestamps at the end if they exist in schema
  if (paths.createdAt) finalHeaders.push('createdAt');
  if (paths.updatedAt) finalHeaders.push('updatedAt');

  return finalHeaders;
};
export const generateDynamicRowData = (doc, model, excludeFields = [], nestedObj = null) => {
  const schema = model.schema;
  const paths = schema.paths;
  const row = [];

  const defaultExclusions = ['__v', '_id'];
  const allExclusions = [...defaultExclusions, ...excludeFields];

  Object.keys(paths).forEach((path) => {
    if (allExclusions.includes(path) || path.includes('.$') || path === 'createdAt' || path === 'updatedAt') {
      return;
    }

    let value = doc[path];

    // ✅ NEW: If value is undefined and nestedObj exists, try from nested object
    if ((value === undefined || value === null) && nestedObj) {
      value = nestedObj[path];
    }

    row.push(formatValueForCSV(value, path));
  });

  if (paths.createdAt) {
    row.push(formatDateTime(doc.createdAt)?.date || 'N/A');
  }
  if (paths.updatedAt) {
    row.push(formatDateTime(doc.updatedAt)?.date || 'N/A');
  }

  return row;
};

export const formatValueForCSV = (value, fieldName = '') => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  // Handle arrays (like images)
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('|') : 'N/A';
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value.toString();
  }

  if (typeof value === 'number') {
    // For EAN codes, phone numbers, or other large identifiers, keep as string to prevent scientific notation
    if (
      fieldName === 'ean' ||
      fieldName === 'phone' ||
      fieldName === 'phoneNumber' ||
      fieldName === 'barcode' ||
      fieldName === 'upc' ||
      fieldName === 'isbn' ||
      value > 999999999999
    ) {
      return `"${value}"`; // Force as text in CSV
    }
    return value.toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return 'N/A';
    }

    if (
      fieldName === 'ean' ||
      fieldName === 'phone' ||
      fieldName === 'phoneNumber' ||
      fieldName === 'barcode' ||
      fieldName === 'upc' ||
      fieldName === 'isbn'
    ) {
      return `"${trimmed}"`;
    }

    if (/^\d{11,}$/.test(trimmed)) {
      return `"${trimmed}"`;
    }
    return trimmed;
  }

  if (typeof value === 'object') {
    return value.toString();
  }

  return value?.toString() || 'N/A';
};

export const formatAddressForCSV = (address) => {
  if (!address) {
    return ['N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
  }

  return [
    address.line1 || 'N/A',
    address.line2 || 'N/A',
    address.line3 || 'N/A',
    address.city || 'N/A',
    address.region || 'N/A',
    address.zipCode || 'N/A',
    address.countryIso || 'N/A',
  ];
};

export const buildExportOrderRow = (order, sku, sellerTotal, sellerId) => {
  const data = {
    orderId: order.orderId,
    sellerId,
    channelOrderNumber: order.channelOrderNumber,
    status: order.status,
    channelName: order.channelName,
    orderDate: order.orderDate,
    merchantOrderNo: order.merchantOrderNo,
    isBusinessOrder: order.isBusinessOrder,

    shippingCostsInclVat: order.shippingCostsInclVat,
    shippingCostsVat: order.shippingCostsVat,
    originalShippingCostsVat: order.originalShippingCostsVat,
    shippingCostsExclVat: order.shippingCostsExclVat,
    originalShippingCostsExclVat: order.originalShippingCostsExclVat,

    subTotalFee: order.subTotalFee,
    orderFee: order.orderFee,

    orderSkuCount: sellerTotal || 1,

    skuId: sku.id,
    skuMerchantProductNo: sku.merchantProductNo,
    skuDescription: sku.description,
    skuQuantity: sku.quantity,
    skuStatus: sku.status,
    skuUnitPriceInclVat: sku.unitPriceInclVat,
    skuLineTotalInclVat: sku.lineTotalInclVat,
    skuGtin: sku.gtin,
    skuChannelProductNo: sku.channelProductNo,
    skuAirWaybillNo: sku.airwaybillNumber || '',
    skuCondition: sku.condition,
    skuVatRate: sku.vatRate,
    skuUnitVat: sku.unitVat,
    skuLineVat: sku.lineVat,
    skuExpectedDeliveryDate: sku.expectedDeliveryDate,
    skuExpectedShipmentDate: sku.expectedShipmentDate,

    orderShippingAddressLine1: order.orderShippingAddress?.line1,
    orderShippingAddressLine2: order.orderShippingAddress?.line2,
    orderShippingAddressLine3: order.orderShippingAddress?.line3,
    orderShippingAddressCompanyName: order.orderShippingAddress?.companyName,
    orderShippingAddressFirstName: order.orderShippingAddress?.firstName,
    orderShippingAddressLastName: order.orderShippingAddress?.lastName,
    orderShippingAddressStreetName: order.orderShippingAddress?.streetName,
    orderShippingAddressHouseNr: order.orderShippingAddress?.houseNr,
    orderShippingAddressHouseNrAddition: order.orderShippingAddress?.houseNrAddition,
    orderShippingAddressZipCode: order.orderShippingAddress?.zipCode,
    orderShippingAddressCity: order.orderShippingAddress?.city,
    orderShippingAddressRegion: order.orderShippingAddress?.region,
    orderShippingAddressCountryIso: order.orderShippingAddress?.countryIso,

    orderBillingAddressLine1: order.orderBillingAddress?.line1,
    orderBillingAddressLine2: order.orderBillingAddress?.line2,
    orderBillingAddressLine3: order.orderBillingAddress?.line3,
    orderBillingAddressCompanyName: order.orderBillingAddress?.companyName,
    orderBillingAddressFirstName: order.orderBillingAddress?.firstName,
    orderBillingAddressLastName: order.orderBillingAddress?.lastName,
    orderBillingAddressStreetName: order.orderBillingAddress?.streetName,
    orderBillingAddressHouseNr: order.orderBillingAddress?.houseNr,
    orderBillingAddressHouseNrAddition: order.orderBillingAddress?.houseNrAddition,
    orderBillingAddressZipCode: order.orderBillingAddress?.zipCode,
    orderBillingAddressCity: order.orderBillingAddress?.city,
    orderBillingAddressRegion: order.orderBillingAddress?.region,
    orderBillingAddressCountryIso: order.orderBillingAddress?.countryIso,

    orderCustomerGender: order.orderCustomer?.gender,
    orderCustomerFirstName: order.orderCustomer?.firstName,
    orderCustomerLastName: order.orderCustomer?.lastName,
    orderCustomerPhone: order.orderCustomer?.phone,
    orderCustomerEmail: order.orderCustomer?.email,
    orderCustomerCompanyRegistrationNo: order.orderCustomer?.companyRegistrationNo,
    orderCustomerChannelCustomerNo: order.orderCustomer?.channelCustomerNo,

    orderPaymentDetailsVatNo: order.orderPaymentDetails?.vatNo,
    orderPaymentDetailsPaymentMethod: order.orderPaymentDetails?.paymentMethod,
    orderPaymentDetailsPaymentReferenceNo: order.orderPaymentDetails?.paymentReferenceNo,

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
  console.log('data------------------', data);
  return data;
};

export const ORDER_EXPORT_HEADERS = [
  'orderId',
  'sellerId',
  'channelOrderNumber',
  'status',
  'channelName',
  'orderDate',
  'merchantOrderNo',
  'isBusinessOrder',
  'shippingCostsInclVat',
  'shippingCostsVat',
  'originalShippingCostsVat',
  'shippingCostsExclVat',
  'originalShippingCostsExclVat',
  'subTotalFee',
  'orderFee',
  'orderSkuListCount',
  'skuId',
  'skuMerchantProductNo',
  'skuDescription',
  'skuQuantity',
  'skuStatus',
  'skuUnitPriceInclVat',
  'skuLineTotalInclVat',
  'skuGtin',
  'skuChannelProductNo',
  'skuAirWaybillNo',
  'skuCondition',
  'skuVatRate',
  'skuUnitVat',
  'skuLineVat',
  'skuExpectedDeliveryDate',
  'skuExpectedShipmentDate',
  'orderShippingAddressLine1',
  'orderShippingAddressLine2',
  'orderShippingAddressLine3',
  'orderShippingAddressCompanyName',
  'orderShippingAddressFirstName',
  'orderShippingAddressLastName',
  'orderShippingAddressStreetName',
  'orderShippingAddressHouseNr',
  'orderShippingAddressHouseNrAddition',
  'orderShippingAddressZipCode',
  'orderShippingAddressCity',
  'orderShippingAddressRegion',
  'orderShippingAddressCountryIso',

  'orderBillingAddressLine1',
  'orderBillingAddressLine2',
  'orderBillingAddressLine3',
  'orderBillingAddressCompanyName',
  'orderBillingAddressFirstName',
  'orderBillingAddressLastName',
  'orderBillingAddressStreetName',
  'orderBillingAddressHouseNr',
  'orderBillingAddressHouseNrAddition',
  'orderBillingAddressZipCode',
  'orderBillingAddressCity',
  'orderBillingAddressRegion',
  'orderBillingAddressCountryIso',

  'orderCustomerGender',
  'orderCustomerFirstName',
  'orderCustomerLastName',
  'orderCustomerPhone',
  'orderCustomerEmail',
  'orderCustomerCompanyRegistrationNo',
  'orderCustomerChannelCustomerNo',

  'orderPaymentDetailsVatNo',
  'orderPaymentDetailsPaymentMethod',
  'orderPaymentDetailsPaymentReferenceNo',
  'createdAt',
  'updatedAt',
];

export default {
  escapeCsv,
  generateCSVFilename,
  validateExportData,
  createCSVExportResponse,
  handleExportError,
  generateDynamicHeaders,
  generateDynamicRowData,
  formatValueForCSV,
  formatAddressForCSV,
  buildExportOrderRow,
  ORDER_EXPORT_HEADERS,
};
