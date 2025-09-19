import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const getMarketplaceCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Schema for req.query
  const querySchema = z.object({
    search: z.string().optional().default(''),
  });
  querySchema.parse(req.query);

  // Schema for req.params
  const paramsSchema = z.object({
    marketPlaceId: z
      .string({
        required_error: 'marketPlaceId is required',
        invalid_type_error: 'marketPlaceId must be a string',
      })
      .regex(/^[1-9]\d*$/, 'marketPlaceId must be a positive number string'),
  });

  paramsSchema.parse(req.params);
});
