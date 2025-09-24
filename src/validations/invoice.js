import { z } from 'zod';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';

export const invoiceMerchantIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z.object({
    merchantNo: z.string().refine((val) => !val || val.trim().length > 0, {
      message: 'Merchant no is required',
    }),
  });
  querySchema.parse(req.query);
});
