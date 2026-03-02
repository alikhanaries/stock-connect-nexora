import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const getOrderStatusValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z.object({
    pageNumber: z
      .string()
      .regex(/^\d+$/, 'pageNumber must be a number string')
      .transform((v) => parseInt(v, 10))
      .refine((v) => v >= 1, {
        message: 'pageNumber must be at least 1',
      }),

    pageSize: z
      .string()
      .refine((v) => v === '5', {
        message: 'pageSize must be 5',
      })
      .transform(() => 5),

    orderIds: z.string().min(1, 'orderIds is required'),
  });

  Object.assign(req.query, querySchema.parse(req.query));
});
