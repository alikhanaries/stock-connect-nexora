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

export const convetDateToUTC = (dateTime) => {
  // Treat input as UTC+3 (your local timezone)
  const date = new Date(`${dateTime}+03:00`);
  // Convert to UTC ISO string with milliseconds and +00:00
  const utcString = date.toISOString().replace('Z', '+00:00');
  return utcString;
};

/**
 * Converts a comma-formatted number string into a float.
 * Useful for normalizing price values from CSV/Excel/ERP imports.
 *
 * Examples:
 *   cleanNumber("1,234.56") → 1234.56
 *   cleanNumber("10,000")   → 10000
 */
export const cleanNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;

  return parseFloat(String(value).replace(/,/g, '').trim());
};

export const truncate = (num) => Math.trunc(num * 100) / 100;

export const resolveDateRange = (query) => {
  const { period, startDate, endDate } = query;

  let start = null;
  let end = null;

  // -------------------------
  // PARSE DD/MM/YYYY
  // -------------------------
  const parseStart = (str) => {
    const [dd, mm, yyyy] = str.split('/').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const parseEnd = (str) => {
    const [dd, mm, yyyy] = str.split('/').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  // -------------------------
  // 1. CUSTOM RANGE (HIGHEST PRIORITY)
  // -------------------------
  if (startDate && endDate) {
    return {
      start: parseStart(startDate),
      end: parseEnd(endDate),
      appliedPeriod: 'custom',
    };
  }

  const now = new Date();

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfToday = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const startOfMonth = () => new Date(now.getFullYear(), now.getMonth(), 1);

  switch (period) {
    case 'today':
      start = startOfToday();
      end = endOfToday();
      break;

    case 'weekly': {
      const today = new Date();
      const day = today.getDay(); // 0 (Sun) - 6 (Sat)

      // Convert Sunday (0) → 7 for easier calc
      const adjustedDay = day === 0 ? 7 : day;

      // Get Monday
      const diff = adjustedDay - 1;

      const startDate = new Date(today);
      startDate.setDate(today.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);

      start = startDate;

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      end = endDate;

      break;
    }

    case 'monthly':
      // 1st day of month → today
      start = startOfMonth();
      start.setHours(0, 0, 0, 0);
      end = endOfToday();
      break;

    case 'last_30_days': {
      const today = new Date();

      // subtract 29 days (NOT 30)
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);

      start = startDate;

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      end = endDate;

      break;
    }

    case 'last_60_days':
      start = new Date();
      start.setDate(start.getDate() - 60);
      start.setHours(0, 0, 0, 0);
      end = endOfToday();
      break;

    case 'last_90_days':
      start = new Date();
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      end = endOfToday();
      break;

    case 'last_120_days':
      start = new Date();
      start.setDate(start.getDate() - 120);
      start.setHours(0, 0, 0, 0);
      end = endOfToday();
      break;

    case 'year_to_date':
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end = endOfToday();
      break;

    default:
      return {
        start: null,
        end: null,
        appliedPeriod: null,
      };
  }

  return {
    start,
    end,
    appliedPeriod: period,
  };
};
export const formatToInvoiceDate = (isoDate) => {
  const date = new Date(isoDate); //  important

  const pad = (n) => String(n).padStart(2, '0');

  const MM = pad(date.getUTCMonth() + 1);
  const DD = pad(date.getUTCDate());
  const YYYY = date.getUTCFullYear();

  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());

  return `${MM}/${DD}/${YYYY} ${HH}:${mm}:${ss} 00:00`;
};
export default {
  formatDateTime,
  formatCustomerName,
};
