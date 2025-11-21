export const formatDateTime = (isoString) => {
  if (!isoString) return null;

  const dateObj = new Date(isoString);
  if (isNaN(dateObj)) return null; // handle invalid date strings safely

  // Format date as YYYY-MM-DD
  const date = dateObj.toISOString().split('T')[0];

  // Format time as h:mm AM/PM (local time)
  const time = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return { date, time };
};

// Helper function for escaping CSV fields
export const escapeCsv = (row) => {
  return row
    .map((f) => {
      const str = String(f ?? '');
      // Need to wrap in quotes if contains comma, quotes, or newlines
      return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    })
    .join(',');
};

// Helper function to format customer name from firstName and lastName
export const formatCustomerName = (customer) => {
  if (!customer || typeof customer !== 'object') return '';

  const firstName = customer.firstName ? String(customer.firstName).trim() : '';
  const lastName = customer.lastName ? String(customer.lastName).trim() : '';

  return `${firstName} ${lastName}`.trim() || '';
};

// Helper function to create CSV export filename with timestamp
export const generateCSVFilename = (prefix = 'data') => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  return `${prefix}-export-${timestamp}.csv`;
};

// Helper function to validate export data and return standardized response
export const validateExportData = (data, entityName = 'items') => {
  if (!data || !Array.isArray(data) || !data.length) {
    return { success: false, message: `No ${entityName} found for export` };
  }
  return { success: true, data };
};

// Helper function to create CSV export response structure
export const createCSVExportResponse = (csvRows = [], filename = 'export.csv', count = 0) => {
  return {
    success: true,
    data: csvRows.join('\n'),
    filename,
    count,
  };
};

// Helper function to handle export errors
export const handleExportError = (error, entityName) => {
  console.error(`Error exporting ${entityName} to CSV:`, error.message);
  return {
    success: false,
    message: `Error generating CSV export for ${entityName}`,
    error: error.message,
  };
};

// Helper function to format address fields for CSV
export const formatAddressForCSV = (address) => {
  if (!address) return ['', '', '', '', '', ''];
  return [
    address.line1 || '',
    address.line2 || '',
    address.city || '',
    address.region || '',
    address.zipCode || '',
    address.countryIso || '',
  ];
};

export default {
  formatDateTime,
  escapeCsv,
  formatCustomerName,
  generateCSVFilename,
  validateExportData,
  createCSVExportResponse,
  handleExportError,
  formatAddressForCSV,
};

export const convetDateToUTC = (dateTime) => {
  // Treat input as UTC+3 (your local timezone)
  const date = new Date(`${dateTime}+03:00`);
  // Convert to UTC ISO string with milliseconds and +00:00
  const utcString = date.toISOString().replace('Z', '+00:00');
  return utcString;
};
