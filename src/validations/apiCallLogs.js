import { z } from 'zod';
import mongoose from 'mongoose';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const SORTABLE_FIELDS = ['createdAt', 'durationMs', 'statusCode', 'method', 'path'];

const paginationFields = {
  page: z
    .string()
    .optional()
    .refine((val) => !val || (!Number.isNaN(Number(val)) && Number(val) > 0), {
      message: 'page must be a positive number',
    })
    .transform((val) => (val ? Number(val) : 1)),

  size: z
    .string()
    .optional()
    .refine((val) => !val || (!Number.isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 200), {
      message: 'size must be a positive number between 1 and 200',
    })
    .transform((val) => (val ? Number(val) : 10)),

  sortOrder: z
    .string()
    .optional()
    .refine((val) => !val || ['asc', 'desc'].includes(val.toLowerCase()), {
      message: 'sortOrder must be either "asc" or "desc"',
    })
    .transform((val) => (val ? val.toLowerCase() : 'desc')),

  sortBy: z
    .string()
    .optional()
    .refine((val) => !val || SORTABLE_FIELDS.includes(val), {
      message: `sortBy must be one of: ${SORTABLE_FIELDS.join(', ')}`,
    })
    .transform((val) => val ?? 'createdAt'),
};

const filterFields = {
  fromDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'fromDate must be a valid date',
    }),

  toDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'toDate must be a valid date',
    }),

  method: z
    .string()
    .optional()
    .refine((val) => !val || HTTP_METHODS.includes(val.trim().toUpperCase()), {
      message: `method must be one of: ${HTTP_METHODS.join(', ')}`,
    })
    .transform((val) => (val ? val.trim().toUpperCase() : undefined)),

  path: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length > 0, {
      message: 'path cannot be empty',
    })
    .transform((val) => (val ? val.trim() : undefined)),

  statusCode: z
    .string()
    .optional()
    .refine((val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= 100 && Number(val) <= 599), {
      message: 'statusCode must be a valid HTTP status code',
    })
    .transform((val) => (val !== undefined ? Number(val) : undefined)),

  requestId: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length > 0, {
      message: 'requestId cannot be empty',
    })
    .transform((val) => (val ? val.trim() : undefined)),

  userId: z
    .string()
    .optional()
    .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
      message: 'userId must be a valid ID format',
    }),

  sellerId: z
    .string()
    .optional()
    .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
      message: 'sellerId must be a valid ID format',
    }),

  integration: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length > 0, {
      message: 'integration cannot be empty',
    })
    .transform((val) => (val ? val.trim() : undefined)),

  isSlow: z
    .string()
    .optional()
    .refine((val) => !val || ['true', 'false', '1', '0'].includes(val.toLowerCase()), {
      message: 'isSlow must be true or false',
    })
    .transform((val) => {
      if (val === undefined) {
        return undefined;
      }
      return val === 'true' || val === '1';
    }),
};

const validateDateRange = (query) => {
  if (query.fromDate && query.toDate) {
    const fromDate = new Date(query.fromDate);
    const toDate = new Date(query.toDate);
    if (fromDate > toDate) {
      throw new Error('fromDate must be before toDate');
    }
  }
};

const parseListQuery = (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z.object({
    ...paginationFields,
    ...filterFields,
  });
  const validatedQuery = querySchema.parse(req.query);
  validateDateRange(validatedQuery);
  req.validatedQuery = validatedQuery;
};

const parseFilterQuery = (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z.object(filterFields);
  const validatedQuery = querySchema.parse(req.query);
  validateDateRange(validatedQuery);
  req.validatedQuery = validatedQuery;
};

export const listApiCallLogsValidator = validate(async (req) => {
  parseListQuery(req);
});

export const getApiCallLogPerformanceValidator = validate(async (req) => {
  parseFilterQuery(req);
});

export const getApiCallLogByRequestIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    requestId: z.string().trim().min(1, 'requestId is required').max(128, 'requestId must be at most 128 characters'),
  });
  req.validatedParams = paramsSchema.parse(req.params);
});
