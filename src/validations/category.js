import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const getPlatformCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Schema for req.query
  const querySchema = z.object({
    search: z.string().optional().default(''),
  });
  const paramsSchema = z.object({
    marketPlaceId: z
      .string({
        required_error: 'marketPlaceId is required',
        invalid_type_error: 'marketPlaceId must be a string',
      })
      .regex(/^\d+$/, 'marketPlaceId must be a number string')
      .transform((val) => parseInt(val, 10)),
  });
  paramsSchema.parse(req.params);
  querySchema.parse(req.query);
});
