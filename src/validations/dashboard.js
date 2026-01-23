import { z } from 'zod';
import { validate } from './validate.js';
// import { headerSchema } from './auth';
import { headerSchema } from './headerSchema.js';

export const orderFlowStatusValidator = validate(async (req) => {
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
  });

  querySchema.parse(req.query);
});

export const statusValidator = validate(async (req) => {
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
