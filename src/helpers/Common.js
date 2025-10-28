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

export default {
  formatDateTime,
};
