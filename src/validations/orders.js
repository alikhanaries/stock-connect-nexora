import { z, ZodError } from 'zod';
import { errorResponse } from '#helpers/response.js';
// Common language list
import { LANGUAGE_CODES, ORDER_STATUS_MAP, VALID_PERIODS } from '#constants/common.js';
const validate = (parseFn) => async (req, res, next) => {
  try {
    await parseFn(req);
    return next();
  } catch (error) {
    console.error('Validation error:', error);
    const message =
      error instanceof ZodError ? error.issues[0]?.message || 'Invalid input' : error.message || 'Server Error';
    return errorResponse(res, message, 400);
  }
};

export const headerSchema = z
  .object({
    authorization: z
      .string({
        required_error: 'Authorization header is required',
        invalid_type_error: 'Authorization must be a string',
      })
      .nonempty('Authorization header cannot be empty'),

    'accept-language': z
      .string({
        required_error: 'Accept-Language header is required',
        invalid_type_error: 'Accept-Language must be a string',
      })
      .nonempty('accept-language cannot be empty')
      .superRefine((val, ctx) => {
        if (!LANGUAGE_CODES.includes(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Accept-Language '${val}' is not supported. Supported languages: ${LANGUAGE_CODES.join(', ')}`,
            path: ['accept-language'],
          });
        }
      }),
  })
  .passthrough();

export const getAllOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Query parameters schema for pagination, filtering, and sorting
  const querySchema = z.object({
    page: z
      .string()
      .optional()
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
        message: 'page must be a positive number',
      })
      .transform((val) => (val ? Number(val) : 1)),

    size: z
      .string()
      .optional()
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 100), {
        message: 'size must be a positive number between 1 and 100',
      })
      .transform((val) => (val ? Number(val) : 10)),

    search: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'search cannot be empty',
      }),

    toDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'toDate must be a valid date',
      }),

    fromDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'fromDate must be a valid date',
      }),

    status: z
      .string()
      .optional()
      .refine((val) => !val || Object.values(ORDER_STATUS_MAP).includes(val), {
        message: `status must be one of: ${Object.values(ORDER_STATUS_MAP).join(', ')}`,
      }),

    sortOrder: z
      .string()
      .optional()
      .refine((val) => !val || ['asc', 'desc'].includes(val.toLowerCase()), {
        message: 'sortOrder must be either "asc" or "desc"',
      })
      .transform((val) => (val ? val.toLowerCase() : 'asc')),

    sortBy: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'sortBy cannot be empty',
      })
      .transform((val) => (val ? val : '_id')),

    platform: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'platform cannot be empty',
      })
      .transform((val) => (val ? val : '')),
  });

  const validatedQuery = querySchema.parse(req.query);

  if (validatedQuery.fromDate && validatedQuery.toDate) {
    const fromDate = new Date(validatedQuery.fromDate);
    const toDate = new Date(validatedQuery.toDate);
    if (fromDate > toDate) {
      throw new Error('fromDate must be before toDate');
    }
  }

  querySchema.parse(req.params);
});

export const getOrderByIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    id: z
      .string()
      .length(24, 'order id must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'order id must be a hex string'),
  });
  paramsSchema.parse(req.params);
});

export const getOrderComparisonValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const comparisonOrderQuerySchema = z.object({
    period: z
      .string()
      .optional()
      .default('week')
      .transform((val) => val.toLowerCase())
      .refine((val) => VALID_PERIODS.includes(val), {
        message: `Invalid period. Please use one of: ${VALID_PERIODS.join(', ')}`,
      }),
  });

  comparisonOrderQuerySchema.parse(req.query);
});
