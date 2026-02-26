import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const getProductCountValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      publishedStatus: z
        .string()
        .transform((v) => v.toUpperCase())
        .refine((val) => val === 'PUBLISHED', {
          message: 'publishedStatus must be PUBLISHED',
        }),
    })
    .passthrough();

  Object.assign(req.query, querySchema.parse(req.query));
});
