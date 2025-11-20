import { z } from 'zod';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';
import mongoose from 'mongoose';

export const getAllReturnsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

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
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
        message: 'size must be a positive number',
      })
      .transform((val) => (val ? Number(val) : 10)),

    status: z.string().optional(),

    channelId: z
      .string()
      .optional()
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
        message: 'channelId must be a positive number',
      })
      .transform((val) => (val ? Number(val) : undefined)),

    returnId: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'returnId cannot be empty',
      }),

    orderID: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'orderID cannot be empty',
      }),

    sellerId: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'sellerId cannot be empty',
      })
      .refine((val) => !val || val.length === 24, {
        message: 'sellerId must be 24 characters long',
      })
      .refine((val) => !val || /^[0-9a-fA-F]+$/.test(val), {
        message: 'sellerId must be a valid hex string',
      }),

    search: z
      .string()
      .optional()
      .refine((val) => !val || (val.trim().length > 0 && val.trim().length >= 1), {
        message: 'search must be at least 1 character long',
      }),

    dateFrom: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'dateFrom must be a valid date',
      }),

    dateTo: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'dateTo must be a valid date',
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
      .transform((val) => (val ? val : 'returnId')),

    source: z
      .string()
      .optional()
      .refine((val) => !val || ['database', 'channelengine'].includes(val.toLowerCase()), {
        message: 'source must be either "database" or "channelengine"',
      })
      .transform((val) => (val ? val.toLowerCase() : 'database')),
  });

  const validatedQuery = querySchema.parse(req.query);

  // Validate date range if both dateFrom and dateTo are provided
  if (validatedQuery.dateFrom && validatedQuery.dateTo) {
    const fromDate = new Date(validatedQuery.dateFrom);
    const toDate = new Date(validatedQuery.dateTo);
    if (fromDate > toDate) {
      throw new Error('dateFrom must be before dateTo');
    }
  }

  return validatedQuery;
});

export const syncReturnsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Query parameters schema for sync operation
  const querySchema = z.object({
    fromDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'fromDate must be a valid date',
      }),

    toDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'toDate must be a valid date',
      }),

    channelIds: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const ids = val.split(',');
          return ids.every((id) => !isNaN(Number(id.trim())) && Number(id.trim()) > 0);
        },
        {
          message: 'channelIds must be comma-separated positive numbers',
        }
      ),

    statuses: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const statuses = val.split(',');
          return statuses.every((status) => status.trim().length > 0);
        },
        {
          message: 'statuses must be comma-separated non-empty strings',
        }
      ),
  });

  const validatedQuery = querySchema.parse(req.query);

  // Validate date range if both dates are provided
  if (validatedQuery.fromDate && validatedQuery.toDate) {
    const fromDate = new Date(validatedQuery.fromDate);
    const toDate = new Date(validatedQuery.toDate);
    if (fromDate > toDate) {
      throw new Error('fromDate must be before toDate');
    }
  }

  return validatedQuery;
});

// Return line schema for validation
const returnLineSchema = z.object({
  MerchantProductNo: z.string().min(1, 'MerchantProductNo is required and cannot be empty'),
  OrderLineId: z.number().int().nonnegative('OrderLineId must be a non-negative number'),
  Quantity: z.number().int().positive('Quantity must be a positive number'),
  ExtraData: z.record(z.any()).optional(),
});

export const returnValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const createReturnSchema = z.object({
    MerchantOrderNo: z.string().min(1, 'MerchantOrderNo is required and cannot be empty'),
    MerchantReturnNo: z.string().min(1, 'MerchantReturnNo is required and cannot be empty'),
    Reason: z.string().min(1, 'Reason is required and cannot be empty'),
    Lines: z.array(returnLineSchema).min(1, 'Lines is required and must contain at least one item'),
    Id: z.number().int().nonnegative().optional(),
    CustomerComment: z.string().optional(),
    MerchantComment: z.string().optional(),
    RefundInclVat: z.number().nonnegative().optional(),
    RefundExclVat: z.number().nonnegative().optional(),
    ReturnDate: z.string().datetime().optional(),
    ExtraData: z.record(z.any()).optional(),
  });

  createReturnSchema.parse(req.body);
});

export const getReturnByIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    id: z
      .string()
      .length(24, 'return id must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'return id must be a hex string'),
  });
  paramsSchema.parse(req.params);
});

//Validates return data structure for saving to database
export const validateReturnData = (returnData) => {
  try {
    if (!returnData) {
      return { success: false, message: 'Return data is required' };
    }

    if (!returnData.Id) {
      return { success: false, message: 'Return ID is required' };
    }

    if (!returnData.MerchantReturnNo) {
      return { success: false, message: 'Merchant Return Number is required' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error validating return data:', error.message);
    return {
      success: false,
      message: `Validation error: ${error.message}`,
      error: error.message,
    };
  }
};
export const validateReturnAck = validate(async (req) => {
  headerSchema.parse(req.headers);

  const acknowledgeReturnSchema = z.object({
    ReturnId: z.number().int().nonnegative('ReturnId is required and must be a non-negative number'),
    MerchantReturnNo: z.string().min(1, 'MerchantReturnNo is required and cannot be empty'),
  });

  acknowledgeReturnSchema.parse(req.body);
});

export const updateReturnLineSchema = z.object({
  MerchantProductNo: z.string().min(1, 'MerchantProductNo is required and cannot be empty'),
  AcceptedQuantity: z.number().int().nonnegative('AcceptedQuantity must be a non-negative number'),
  RejectedQuantity: z.number().int().nonnegative('RejectedQuantity must be a non-negative number'),
});

export const updateReturnValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const updateReturnSchema = z.object({
    ReturnId: z.number().int().nonnegative('ReturnId is required and must be a non-negative number'),
    Lines: z.array(updateReturnLineSchema).min(1, 'Lines is required and must contain at least one item'),
  });

  updateReturnSchema.parse(req.body);
});

export const getReturnStatsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z.object({
    sellerId: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'sellerId cannot be empty',
      })
      .refine((val) => !val || mongoose.Types.ObjectId.isValid(val), {
        message: 'sellerId must be a valid ObjectId',
      }),
  });

  querySchema.parse(req.query);
});

export const exportReturnsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z.object({
    status: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'status cannot be empty',
      }),

    platform: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'platform cannot be empty',
      }),

    channelId: z
      .string()
      .optional()
      .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
        message: 'channelId must be a positive number',
      })
      .transform((val) => (val ? Number(val) : undefined)),

    search: z
      .string()
      .optional()
      .refine((val) => !val || (val.trim().length > 0 && val.trim().length >= 1), {
        message: 'search must be at least 1 character long',
      }),

    dateFrom: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'dateFrom must be a valid date',
      }),

    dateTo: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'dateTo must be a valid date',
      }),
  });

  const validatedQuery = querySchema.parse(req.query);

  // Validate date range if both dateFrom and dateTo are provided
  if (validatedQuery.dateFrom && validatedQuery.dateTo) {
    const fromDate = new Date(validatedQuery.dateFrom);
    const toDate = new Date(validatedQuery.dateTo);
    if (fromDate > toDate) {
      throw new Error('dateFrom must be before dateTo');
    }
  }

  return validatedQuery;
});

export default {
  getAllReturnsValidator,
  syncReturnsValidator,
  validateReturnData,
  validateReturnAck,
  returnValidator,
  updateReturnValidator,
  getReturnByIdValidator,
  getReturnStatsValidator,
  exportReturnsValidator,
};
