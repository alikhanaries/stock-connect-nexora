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

// Helper function to format customer name from firstName and lastName
export const formatCustomerName = (customer) => {
  if (!customer || typeof customer !== 'object') return '';

  const firstName = customer.firstName ? String(customer.firstName).trim() : '';
  const lastName = customer.lastName ? String(customer.lastName).trim() : '';

  return `${firstName} ${lastName}`.trim() || '';
};

export default {
  formatDateTime,
  formatCustomerName,
};

export const convetDateToUTC = (dateTime) => {
  // Treat input as UTC+3 (your local timezone)
  const date = new Date(`${dateTime}+03:00`);
  // Convert to UTC ISO string with milliseconds and +00:00
  const utcString = date.toISOString().replace('Z', '+00:00');
  return utcString;
};
