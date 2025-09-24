import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const getStockConnectCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Schema for req.query
  const querySchema = z.object({
    search: z.string().optional().default(''),
  });
  querySchema.parse(req.query);
});
