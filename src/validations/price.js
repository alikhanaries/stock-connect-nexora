import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

// /* UPDATE SINGLE PRICE VALIDATOR */
export const updateSingleProductPriceValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z
    .object({
      productId: z
        .string()
        .length(24, 'productId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'productId must be a hex string'),

      // Mandatory
      price: z.number().min(0, 'price must be 0 or greater'),

      // Optional fields (validated only if present)
      minPrice: z.number().min(0, 'minPrice must be 0 or greater').optional(),
      maxPrice: z.number().min(0, 'maxPrice must be 0 or greater').optional(),
      msrp: z.number().min(0, 'msrp must be 0 or greater').optional(),
      purchasePrice: z.number().min(0, 'purchasePrice must be 0 or greater').optional(),
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

/* SYNC PRICE TO CHANNELS VALIDATOR */
export const syncPriceToChannelEngineValidator = validate(async (req) => {
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
