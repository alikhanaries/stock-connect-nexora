import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const getOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      pageNumber: z
        .string()
        .regex(/^\d+$/, 'pageNumber must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, {
          message: 'pageNumber must be at least 1',
        }),

      pageSize: z
        .string()
        .refine((val) => val === '50', {
          message: 'pageSize must be 50',
        })
        .transform(() => 50),

      startDate: z.string().datetime({ message: 'startDate must be ISO datetime' }).optional(),

      endDate: z.string().datetime({ message: 'endDate must be ISO datetime' }).optional(),

      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: 'startDate must be less than or equal to endDate',
        path: ['startDate'],
      }
    );

  Object.assign(req.query, querySchema.parse(req.query));
});
