import { formatDateTime } from './Common.js';

export const escapeCsv = (row) => {
  return row
    .map((field) => {
      if (field === null || field === undefined || field === '') return 'N/A';
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
};
