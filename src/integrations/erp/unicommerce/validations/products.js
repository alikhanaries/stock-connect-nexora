import { z } from 'zod';
import { validate } from '#root/src/validations/validate.js';
import { headerSchema } from './auth.js';

export const getProductsValidator = validate(async (req) => {
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

      publishedStatus: z
        .string()
        .transform((v) => v.toUpperCase())
        .refine((val) => val === 'PUBLISHED', {
          message: 'publishedStatus must be PUBLISHED',
        }),

      skus: z.string().optional(),
    })
    .passthrough();

  Object.assign(req.query, querySchema.parse(req.query));
});
