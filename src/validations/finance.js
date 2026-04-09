import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const transactionHistoryValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      marketplace: z.string().optional(),
      search: z.string().optional(),
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
      page: z
        .string()
        .optional()
        .refine((val) => !val || (Number.isInteger(Number(val)) && Number(val) >= 1), {
          message: 'page must be a positive integer',
        }),
      limit: z
        .string()
        .optional()
        .refine((val) => !val || (Number.isInteger(Number(val)) && Number(val) >= 1 && Number(val) <= 100), {
          message: 'limit must be an integer between 1 and 100',
        }),
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

export const financeDashboardValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      marketplace: z.string().optional(),
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
