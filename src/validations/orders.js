import { z } from 'zod';
import path from 'path';
// Common language list
import { VALID_PERIODS, ORDER_STATUS_MAP } from '#constants/common.js';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';
import mongoose from 'mongoose';

const orderLineSchema = z.object({
  merchantProductNo: z.string(),
  orderLineId: z.number().int().positive(),
  quantity: z.number().int().min(1, 'You must cancel at least 1 item if you want to cancel'),
});

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
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 200), {
        message: 'size must be a positive number between 1 and 200',
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

    status: z.string().optional(),

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
      .refine((val) => !val || val.trim().length > 0, {
        message: 'sortBy cannot be empty',
      })
      .transform((val) => (val ? val : 'orderId')),

    platform: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'platform cannot be empty',
      })
      .transform((val) => (val ? val : '')),
    sellerId: z
      .string()
      .trim()
      .refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: 'sellerId must be a valid ID format',
      })
      .optional(),
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

export const syncOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z.object({
    sellerId: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'sellerId must be a valid ID format',
      }),
  });
  querySchema.parse(req.params);
});

export const orderStatsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z.object({
    sellerId: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'sellerId must be a valid ID format',
      }),
  });
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
  const querySchema = z.object({
    period: z
      .string()
      .optional()
      .default('week')
      .transform((val) => val.toLowerCase())
      .refine((val) => VALID_PERIODS.includes(val), {
        message: `Invalid period. Please use one of: ${VALID_PERIODS.join(', ')}`,
      }),
    sellerId: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'sellerId must be a valid ID format',
      }),
  });

  querySchema.parse(req.query);
});

export const merchantCancelIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const merchantCancelByIdSchema = z.object({
    orderId: z
      .string()
      .length(24, 'order id must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'order id must be a hex string'),
    reason: z
      .string()
      .min(1, 'Reason should be long enough to have a meaning.')
      .max(500, 'Reason must be within 500 characters.')
      .regex(/^[a-zA-Z0-9\s.,:'"]+$/, 'Reason must be a valid statement.'),
    specifics: z.array(orderLineSchema).optional().default([]),
  });
  merchantCancelByIdSchema.parse(req.body);
});

export const cancelFullOrderValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    orderId: z
      .string()
      .length(24, 'order id must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'order id must be a hex string'),

    reason: z
      .string()
      .min(1, 'Reason should be long enough to have a meaning.')
      .max(500, 'Reason must be within 500 characters.')
      .regex(/^[a-zA-Z0-9\s.,:'"]+$/, 'Reason must be a valid statement.')
      .optional(), // 👈 makes it optional
  });

  bodySchema.parse(req.body);
});

export const cancelPartialOrderValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    orderId: z
      .string()
      .length(24, 'Order ID must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'Order ID must be a hex string'),

    reason: z
      .string()
      .min(1, 'Reason should be long enough to have a meaning.')
      .max(500, 'Reason must be within 500 characters.')
      .regex(/^[a-zA-Z0-9\s.,:'"]+$/, 'Reason must be a valid statement.')
      .optional(),

    products: z
      .array(
        z.object({
          orderLineId: z.number().min(1, 'Order line ID is required'),
          quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than zero'),
          merchantProductNo: z.string().optional(),
        })
      )
      .min(1, 'Products array cannot be empty'),
  });

  bodySchema.parse(req.body);
});

export const exportOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Query parameters schema for export filters
  const querySchema = z.object({
    status: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const validStatuses = Object.values(ORDER_STATUS_MAP);
          const statusArray = val.split(',').map((s) => s.trim().toUpperCase());
          return statusArray.every((s) => validStatuses.includes(s));
        },
        {
          message: `Invalid status. Valid statuses are: ${Object.values(ORDER_STATUS_MAP).join(', ')}`,
        }
      ),

    platform: z.string().optional(),

    search: z.string().optional(),
  });

  querySchema.parse(req.query);
});

export const generateDocumentIdValidator = validate(async (req) => {
  // Normalize body values
  const body = req.body || {};
  const file = req.file;

  const skuCodes = body.skuCodes
    ? Array.isArray(body.skuCodes)
      ? body.skuCodes.map((s) => s.replace(/^"|"$/g, ''))
      : [body.skuCodes.replace(/^"|"$/g, '')]
    : [];

  const bodySchema = z.object({
    orderId: z
      .string()
      .nonempty('orderId is required')
      .transform((v) => v.replace(/^"|"$/g, '')),

    skuCodes: z.array(z.string().nonempty()).nonempty('skuCodes[] should not be empty'),

    file: z
      .any()
      .refine((f) => !!f, { message: 'Please upload a valid file' })
      .refine(
        (f) => {
          if (!f) return false;
          const allowedExtensions = ['pdf', 'image', 'jpg', 'jpeg', 'png'];
          const ext = path
            .extname(f.originalname || '')
            .slice(1)
            .toLowerCase();
          return allowedExtensions.includes(ext);
        },
        { message: 'Please upload a valid file' }
      )
      .refine((f) => !f || f.size <= 200 * 1024, { message: 'File size should not exceed 200 KB' }),
  });

  // Parse combined body with normalized skuCodes
  bodySchema.parse({ ...body, skuCodes, file });

  // Replace original body skuCodes with normalized array
  req.body.skuCodes = skuCodes;
});
