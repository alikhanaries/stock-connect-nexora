import { z } from 'zod';
import { validate } from './validate.js';
// import { headerSchema } from './auth';
import { headerSchema } from './headerSchema.js';

const ALLOWED_CHANNELS = new Set(['all', 'amazon', 'noon', 'namshi', 'ocp']);
export const orderFlowStatusValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);

  // Validate query params
  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),
      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});
export const orderOverviewValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),

      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});
export const orderAnalyticsValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);

  // Validate query params
  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),
      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});

export const statusValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);

  // Validate query params
  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),
      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});

export const inventoryStatusValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);

  // Validate query params
  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),
      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});

export const topOrdersValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);

  // Validate query params
  const querySchema = z.object({
    period: z
      .string()
      .optional()
      .refine((val) => !val || ['today', 'weekly', 'monthly'].includes(val), {
        message: 'period must be one of today, weekly, or monthly',
      }),
    type: z
      .string()
      .optional()
      .refine((val) => !val || ['product', 'category'].includes(val), {
        message: 'type must be one of product, category',
      }),
  });

  querySchema.parse(req.query);
});

export const salesByChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),

      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });
  querySchema.parse(req.query);
});

export const ordersByChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      channel: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (val === undefined || val === null || val === '') return true;

            const values = String(val)
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean);

            if (!values.length) return true;

            return values.every((v) => ALLOWED_CHANNELS.has(v));
          },
          { message: 'channel must be one of: all, amazon, noon, namshi, ocp (comma-separated allowed)' }
        ),

      period: z
        .string()
        .optional()
        .refine(
          (val) => {
            if (!val) return true;
            if (['today', 'weekly', 'monthly', 'all', 'month'].includes(val)) return true;
            // rolling window: last N days
            const m = /^last_(\d{1,3})_days$/.exec(val);
            if (!m) return false;
            const n = Number(m[1]);
            return Number.isInteger(n) && n >= 1 && n <= 365;
          },
          { message: 'period must be today, weekly, monthly, all, month, or last_<N>_days (1..365)' }
        ),

      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month must be in YYYY-MM format')
        .optional(),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .refine((q) => !(q.startDate || q.endDate) || (q.startDate && q.endDate), {
      message: 'Both startDate and endDate are required for custom range',
      path: ['startDate'],
    })
    .refine((q) => !q.month || q.period === 'month', {
      message: 'month is allowed only when period=month',
      path: ['month'],
    })
    .refine((q) => !(q.period && (q.startDate || q.endDate)), {
      message: 'startDate and endDate are not allowed when period is provided',
      path: ['startDate'],
    })
    .refine((q) => !(q.period === 'month' && !q.month), {
      message: 'month is required when period=month',
      path: ['month'],
    });

  querySchema.parse(req.query);
});
