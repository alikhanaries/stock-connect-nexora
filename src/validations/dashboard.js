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
