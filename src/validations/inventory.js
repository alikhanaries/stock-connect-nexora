import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

// /* UPDATE SINGLE INVENTORY VALIDATOR */
export const updateSingleInventoryValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z
    .object({
      productId: z
        .string()
        .length(24, 'productId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'productId must be a hex string'),

      currentStockCount: z
        .number()
        .int('currentStockCount must be an integer')
        .min(0, 'currentStockCount must be 0 or greater'),
    })
    .strict();

  const querySchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
      .optional(),
  });

  querySchema.parse(req.query);
  bodySchema.parse(req.body);
});

/* SYNC STOCK TO CHANNELS VALIDATOR */
export const syncStockToChannelEngineValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
      .optional(),
  });

  querySchema.parse(req.query);
});
