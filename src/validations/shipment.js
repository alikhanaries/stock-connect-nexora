import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';

export const createShipmentValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const bodySchema = z.object({
    id: z.string().nonempty({ message: 'orderId is required' }),
    sellerId: z.string().nonempty({ message: 'sellerId is required' }),
    userId: z.string().nonempty({ message: 'userId is required' }),

    // Delivery can be object or string
    delivery: z.union([
      z.string().nonempty({ message: 'deliveryId is required' }),
      z.object({
        name: z.string().nonempty(),
        email: z.string().email().optional(),
        city: z.string().nonempty(),
        address: z.string().nonempty(),
        neighbourhood: z.string().optional(),
        postcode: z.string().optional(),
        country: z.string().nonempty(),
        phone: z.string().nonempty(),
        secondaryPhone: z.string().optional(),
        description: z.string().optional(),
      }),
    ]),

    // Collection can be object or string
    collection: z.union([
      z.string().nonempty({ message: 'collectionId is required' }),
      z.object({
        name: z.string().nonempty(),
        email: z.string().email().optional(),
        city: z.string().nonempty(),
        address: z.string().nonempty(),
        postcode: z.string().optional(),
        country: z.string().nonempty(),
        phone: z.string().nonempty(),
        description: z.string().optional(),
      }),
    ]),

    declaredValue: z.number({ invalid_type_error: 'declaredValue must be a number' }),
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

    weightDetails: z.object({
      unit: z.string().nonempty(),
      value: z.number({ invalid_type_error: 'weight value must be a number' }),
    }),
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
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine((val) => val > 0, { message: 'Limit must be greater than 0' }),
    status: z.string().optional(),
    search: z.string().optional(),
    sellerId: z.string().optional(),
  });

  await querySchema.parseAsync(req.query);
});
