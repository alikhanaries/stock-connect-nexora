export const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const getDateRange = (period, offset = 0) => {
  if (!['today', 'weekly', 'monthly'].includes(period)) return null;

  const now = new Date();
  let start, end;

  if (period === 'today') {
    start = new Date(startOfDay(now).getTime() + offset * DAY_MS);
    end = endOfDay(start);
  }

  if (period === 'weekly') {
    const endDate = new Date(startOfDay(now).getTime() + offset * 7 * DAY_MS);
    start = new Date(endDate.getTime() - 6 * DAY_MS);
    end = endOfDay(endDate);
  }

  if (period === 'monthly') {
    const year = now.getFullYear();
    const month = now.getMonth() + offset;

    start = new Date(year, month, 1);
    end = endOfDay(new Date(year, month + 1, 0));
  }

  return { start, end };
};

export const getPreviousRange = (period, currentRange) => {
  const { start } = currentRange;

  switch (period) {
    case 'today': {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      return {
        start: new Date(y.setHours(0, 0, 0, 0)),
        end: new Date(y.setHours(23, 59, 59, 999)),
      };
    }
    case 'weekly':
      return {
        start: new Date(start.getTime() - 7 * DAY_MS),
        end: new Date(start.getTime() - 1),
      };
    case 'monthly':
      return {
        start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
        end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
      };
  }
};

export default {
  getDateRange,
  getPreviousRange,
};
