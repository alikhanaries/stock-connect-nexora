import { z } from 'zod';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';

export const getAllReturnsValidator = validate(async (req) => {
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

    status: z
      .string()
      .optional()
      .refine((val) => !val || val.trim().length > 0, {
        message: 'status cannot be empty',
      }),

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

/**
 * Validates return data for creation/update operations
 */
export const validateReturn = (req, res, next) => {
  const {
    MerchantOrderNo,
    MerchantReturnNo,
    Lines,
    Id,
    Reason,
    CustomerComment,
    MerchantComment,
    RefundInclVat,
    RefundExclVat,
    ReturnDate,
    ExtraData,
  } = req.body;

  const errors = [];

  // Check for required top-level fields
  if (!MerchantOrderNo || typeof MerchantOrderNo !== 'string') {
    errors.push('MerchantOrderNo is required and must be a string.');
  }

  if (!MerchantReturnNo || typeof MerchantReturnNo !== 'string') {
    errors.push('MerchantReturnNo is required and must be a string.');
  }

  if (!Reason || typeof Reason !== 'string') {
    errors.push('Reason is required and must be a string.');
  }

  // Validate Lines array
  if (!Lines || !Array.isArray(Lines) || Lines.length === 0) {
    errors.push('Lines is required and must be a non-empty array.');
  } else {
    Lines.forEach((line, index) => {
      if (!line.MerchantProductNo || typeof line.MerchantProductNo !== 'string') {
        errors.push(`Lines[${index}].MerchantProductNo is required and must be a string.`);
      }
      if (line.OrderLineId === undefined || typeof line.OrderLineId !== 'number' || line.OrderLineId < 0) {
        errors.push(`Lines[${index}].OrderLineId is required and must be a non-negative number.`);
      }
      if (line.Quantity === undefined || typeof line.Quantity !== 'number' || line.Quantity <= 0) {
        errors.push(`Lines[${index}].Quantity is required and must be a number greater than 0.`);
      }
      if (line.ExtraData !== undefined && typeof line.ExtraData !== 'object') {
        errors.push(`Lines[${index}].ExtraData must be an object if provided.`);
      }
    });
  }

  // Validate optional numeric fields
  if (Id !== undefined && (typeof Id !== 'number' || Id < 0)) {
    errors.push('Id must be a non-negative number if provided.');
  }

  if (RefundInclVat !== undefined && (typeof RefundInclVat !== 'number' || RefundInclVat < 0)) {
    errors.push('RefundInclVat must be a non-negative number if provided.');
  }

  if (RefundExclVat !== undefined && (typeof RefundExclVat !== 'number' || RefundExclVat < 0)) {
    errors.push('RefundExclVat must be a non-negative number if provided.');
  }

  // Validate optional string fields
  if (CustomerComment !== undefined && typeof CustomerComment !== 'string') {
    errors.push('CustomerComment must be a string if provided.');
  }

  if (MerchantComment !== undefined && typeof MerchantComment !== 'string') {
    errors.push('MerchantComment must be a string if provided.');
  }

  // Validate ReturnDate
  if (ReturnDate !== undefined) {
    const date = new Date(ReturnDate);
    if (isNaN(date.getTime())) {
      errors.push('ReturnDate must be a valid ISO 8601 date string if provided.');
    }
  }

  // Validate ExtraData
  if (ExtraData !== undefined && typeof ExtraData !== 'object') {
    errors.push('ExtraData must be an object if provided.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  next();
};

/**
 * Validates return data structure for saving to database
 */
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

export default {
  getAllReturnsValidator,
  syncReturnsValidator,
  validateReturnData,
  validateReturn,
};
