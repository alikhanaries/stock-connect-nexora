import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const updateInventoryValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    inventoryList: z
      .array(
        z.object({
          productId: z.string().min(1, 'productId is required'),
          variantId: z.string().min(1, 'variantId is required'),
          inventory: z
            .union([z.string(), z.number()])
            .transform((v) => Number(v))
            .refine((v) => !isNaN(v) && v >= 0, {
              message: 'inventory must be a non-negative number',
            }),
          hsnCode: z.string().optional(),
          facilityCode: z.string().optional(),
        })
      )
      .min(1, 'inventoryList cannot be empty'),
  });
  req.body = bodySchema.parse(req.body);
});
