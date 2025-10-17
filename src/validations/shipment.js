import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const createShipmentValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const bodySchema = z.object({
    id: z.string().nonempty({ message: 'orderId is required' }),
    sellerId: z.string().nonempty({ message: 'sellerId is required' }),
    pieces: z.number().optional().default(0),
    pickUpId: z.string().nonempty({ message: 'pickUpId is required' }),
    declaredValue: z.number({ invalid_type_error: 'declaredValue must be a number' }).optional(),
    declaredValueCurrency: z.string().optional().default('SAR'),
    isCod: z.boolean().optional().default(true),
    codAmount: z.number().optional().default(0),
    currency: z.string().optional().default('SAR'),

    // New products array (mandatory)
    products: z
      .array(
        z.object({
          merchantProductNo: z.string().nonempty({ message: 'merchantProductNo is required' }),
          orderLineId: z.string().nonempty({ message: 'orderLineId is required' }),
          quantity: z.number().min(1, { message: 'quantity must be at least 1' }),
        })
      )
      .nonempty({ message: 'products must contain at least one item' }),
  });
  bodySchema.parse(req.body);
});

export const getShipmentValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const querySchema = z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, { message: 'Page must be greater than 0' }),
    size: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine((val) => val > 0, { message: 'Limit must be greater than 0' }),
    status: z.string().optional(),
    search: z.string().optional(),
  });

  await querySchema.parseAsync(req.query);
});

export const getSingleShipmentValidator = validate(async (req) => {
  //  await headerSchema.parseAsync(req.headers);
  const paramsSchema = z.object({
    id: z
      .string({
        required_error: 'id is required',
        invalid_type_error: 'id must be a string',
      })
      .length(24, 'id must be exactly 24 characters') // ObjectId length
      .regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid hex string'), // ObjectId format
  });
  paramsSchema.parse(req.params);
});
