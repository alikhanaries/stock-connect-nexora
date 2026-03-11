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

export const generateDynamicRowData = (doc, model, excludeFields = []) => {
  const schema = model.schema;
  const paths = schema.paths;
  const row = [];

  // Standard exclusions for internal fields
  const defaultExclusions = ['__v', '_id'];
  const allExclusions = [...defaultExclusions, ...excludeFields];

  Object.keys(paths).forEach((path) => {
    // Skip excluded fields and nested array paths
    if (allExclusions.includes(path) || path.includes('.$') || path === 'createdAt' || path === 'updatedAt') {
      return;
    }

    const value = doc[path];
    row.push(formatValueForCSV(value, path));
  });

  // Add timestamps at the end if they exist
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

export const buildExportOrderRow = (order, sku, sellerTotal) => {
  return {
    orderId: order.orderId,
    channelOrderNumber: order.channelOrderNumber,
    status: order.status,
    channelName: order.channelName,
    orderDate: order.orderDate,
    merchantOrderNo: order.merchantOrderNo,
    isBusinessOrder: order.isBusinessOrder,

    subTotalInclVat: sellerTotal.subTotalInclVat,
    subTotalVat: sellerTotal.subTotalVat,
    shippingCostsInclVat: order.shippingCostsInclVat,
    shippingCostsVat: order.shippingCostsVat,
    totalInclVat: sellerTotal.totalInclVat,
    totalVat: sellerTotal.totalVat,

    originalSubTotalInclVat: order.originalSubTotalInclVat,
    originalSubTotalVat: order.originalSubTotalVat,
    originalShippingCostsVat: order.originalShippingCostsVat,
    originalTotalInclVat: order.originalTotalInclVat,
    originalTotalVat: order.originalTotalVat,

    subTotalExclVat: sellerTotal.subTotalExclVat,
    totalExclVat: sellerTotal.totalExclVat,
    shippingCostsExclVat: order.shippingCostsExclVat,
    originalSubTotalExclVat: order.originalSubTotalExclVat,
    originalShippingCostsExclVat: order.originalShippingCostsExclVat,
    originalTotalExclVat: order.originalTotalExclVat,

    subTotalFee: order.subTotalFee,
    orderFee: order.orderFee,

    orderSkuList_skuList_count: 1,

    skuList_id_list: sku.id,
    skuList_merchantProductNo_list: sku.merchantProductNo,
    skuList_description_list: sku.description,
    skuList_quantity_list: sku.quantity,
    skuList_status_list: sku.status,
    skuList_unitPriceInclVat_list: sku.unitPriceInclVat,
    skuList_lineTotalInclVat_list: sku.lineTotalInclVat,
    skuList_gtin_list: sku.gtin,
    skuList_channelProductNo_list: sku.channelProductNo,
    skuList_airWaybillNo_list: sku.airWaybillNo,
    skuList_condition_list: sku.condition,
    skuList_vatRate_list: sku.vatRate,
    skuList_unitVat_list: sku.unitVat,
    skuList_lineVat_list: sku.lineVat,
    skuList_expectedDeliveryDate_list: sku.expectedDeliveryDate,
    skuList_expectedShipmentDate_list: sku.expectedShipmentDate,

    orderShippingAddress_line1: order.orderShippingAddress?.line1,
    orderShippingAddress_line2: order.orderShippingAddress?.line2,
    orderShippingAddress_line3: order.orderShippingAddress?.line3,
    orderShippingAddress_companyName: order.orderShippingAddress?.companyName,
    orderShippingAddress_firstName: order.orderShippingAddress?.firstName,
    orderShippingAddress_lastName: order.orderShippingAddress?.lastName,
    orderShippingAddress_streetName: order.orderShippingAddress?.streetName,
    orderShippingAddress_houseNr: order.orderShippingAddress?.houseNr,
    orderShippingAddress_houseNrAddition: order.orderShippingAddress?.houseNrAddition,
    orderShippingAddress_zipCode: order.orderShippingAddress?.zipCode,
    orderShippingAddress_city: order.orderShippingAddress?.city,
    orderShippingAddress_region: order.orderShippingAddress?.region,
    orderShippingAddress_countryIso: order.orderShippingAddress?.countryIso,

    orderBillingAddress_line1: order.orderBillingAddress?.line1,
    orderBillingAddress_line2: order.orderBillingAddress?.line2,
    orderBillingAddress_line3: order.orderBillingAddress?.line3,
    orderBillingAddress_companyName: order.orderBillingAddress?.companyName,
    orderBillingAddress_firstName: order.orderBillingAddress?.firstName,
    orderBillingAddress_lastName: order.orderBillingAddress?.lastName,
    orderBillingAddress_streetName: order.orderBillingAddress?.streetName,
    orderBillingAddress_houseNr: order.orderBillingAddress?.houseNr,
    orderBillingAddress_houseNrAddition: order.orderBillingAddress?.houseNrAddition,
    orderBillingAddress_zipCode: order.orderBillingAddress?.zipCode,
    orderBillingAddress_city: order.orderBillingAddress?.city,
    orderBillingAddress_region: order.orderBillingAddress?.region,
    orderBillingAddress_countryIso: order.orderBillingAddress?.countryIso,

    orderCustomer_gender: order.orderCustomer?.gender,
    orderCustomer_firstName: order.orderCustomer?.firstName,
    orderCustomer_lastName: order.orderCustomer?.lastName,
    orderCustomer_phone: order.orderCustomer?.phone,
    orderCustomer_email: order.orderCustomer?.email,
    orderCustomer_companyRegistrationNo: order.orderCustomer?.companyRegistrationNo,
    orderCustomer_channelCustomerNo: order.orderCustomer?.channelCustomerNo,

    orderPaymentDetails_vatNo: order.orderPaymentDetails?.vatNo,
    orderPaymentDetails_paymentMethod: order.orderPaymentDetails?.paymentMethod,
    orderPaymentDetails_paymentReferenceNo: order.orderPaymentDetails?.paymentReferenceNo,

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const ORDER_EXPORT_HEADERS = [
  'orderId',
  'channelOrderNumber',
  'status',
  'channelName',
  'orderDate',
  'merchantOrderNo',
  'isBusinessOrder',
  'subTotalInclVat',
  'subTotalVat',
  'shippingCostsInclVat',
  'shippingCostsVat',
  'totalInclVat',
  'totalVat',
  'originalSubTotalInclVat',
  'originalSubTotalVat',
  'originalShippingCostsVat',
  'originalTotalInclVat',
  'originalTotalVat',
  'subTotalExclVat',
  'totalExclVat',
  'shippingCostsExclVat',
  'originalSubTotalExclVat',
  'originalShippingCostsExclVat',
  'originalTotalExclVat',
  'subTotalFee',
  'orderFee',
  'orderSkuList_skuList_count',
  'skuList_id_list',
  'skuList_merchantProductNo_list',
  'skuList_description_list',
  'skuList_quantity_list',
  'skuList_status_list',
  'skuList_unitPriceInclVat_list',
  'skuList_lineTotalInclVat_list',
  'skuList_gtin_list',
  'skuList_channelProductNo_list',
  'skuList_airWaybillNo_list',
  'skuList_condition_list',
  'skuList_vatRate_list',
  'skuList_unitVat_list',
  'skuList_lineVat_list',
  'skuList_expectedDeliveryDate_list',
  'skuList_expectedShipmentDate_list',
  'orderShippingAddress_line1',
  'orderShippingAddress_line2',
  'orderShippingAddress_line3',
  'orderShippingAddress_companyName',
  'orderShippingAddress_firstName',
  'orderShippingAddress_lastName',
  'orderShippingAddress_streetName',
  'orderShippingAddress_houseNr',
  'orderShippingAddress_houseNrAddition',
  'orderShippingAddress_zipCode',
  'orderShippingAddress_city',
  'orderShippingAddress_region',
  'orderShippingAddress_countryIso',
  'orderBillingAddress_line1',
  'orderBillingAddress_line2',
  'orderBillingAddress_line3',
  'orderBillingAddress_companyName',
  'orderBillingAddress_firstName',
  'orderBillingAddress_lastName',
  'orderBillingAddress_streetName',
  'orderBillingAddress_houseNr',
  'orderBillingAddress_houseNrAddition',
  'orderBillingAddress_zipCode',
  'orderBillingAddress_city',
  'orderBillingAddress_region',
  'orderBillingAddress_countryIso',
  'orderCustomer_gender',
  'orderCustomer_firstName',
  'orderCustomer_lastName',
  'orderCustomer_phone',
  'orderCustomer_email',
  'orderCustomer_companyRegistrationNo',
  'orderCustomer_channelCustomerNo',
  'orderPaymentDetails_vatNo',
  'orderPaymentDetails_paymentMethod',
  'orderPaymentDetails_paymentReferenceNo',
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
