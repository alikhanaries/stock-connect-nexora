import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
import { mongoIdField, safeNumber, notNullString, notNullBoolean } from './helper.js';

export const createShipmentValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    id: mongoIdField('id', { required: true }),
    sellerId: mongoIdField('sellerId', { required: true }),
    pickUpId: mongoIdField('pickUpId', undefined, { required: true }),

    declaredValue: safeNumber('declaredValue', 0),
    declaredValueCurrency: notNullString('declaredValueCurrency', 'SAR'),
    currency: notNullString('currency', 'SAR', { required: true }),

    isCod: notNullBoolean('isCod', true),
    codAmount: safeNumber('codAmount', 0),
    pieces: safeNumber('pieces', 0, { required: true }),

    products: z
      .array(
        z.object({
          merchantProductNo: notNullString('merchantProductNo', undefined, { required: true }),
          orderLineId: safeNumber('orderLineId', 0, { required: true }),
          quantity: safeNumber('quantity', 0, { required: true }),
          hsCode: notNullString('hsCode', undefined, { required: true }),
        })
      )
      .nonempty({ message: 'products must contain at least one item' }),
  });

  return bodySchema.parse(req.body);
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

export const ayMakanWebHookValidator = validate(async (req) => {
  const headerSchema = z.object({
    'x-custom-auth': z
      .string({
        required_error: 'X-Custom-Auth header is required',
        invalid_type_error: 'X-Custom-Auth must be a string',
      })
      .nonempty('X-Custom-Auth header cannot be empty'),
  });

  await headerSchema.parseAsync(req.headers);
});

export const getSingleShipmentValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);
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

// CANCEL SHIPMENT VALIDATOR
export const cancelShipmentValidator = validate(async (req) => {
  // Validate headers (if needed)
  headerSchema.parse(req.headers);

  // Validate request body
  const bodySchema = z.object({
    shipmentId: z.string().nonempty({ message: 'shipmentId is required' }),
    reason: z.string().optional(),
  });

  bodySchema.parse(req.body);
});

export const createManualShipmentValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    orderId: mongoIdField('orderId', { required: true }),
    sellerId: mongoIdField('sellerId', { required: true }),
    pickUpId: mongoIdField('pickUpId', undefined, { required: true }),

    airWaybillNo: notNullString('airWaybillNo', undefined, { required: true }),
    merchantShipmentNo: notNullString('merchantShipmentNo', undefined, { required: true }),
    method: notNullString('method', undefined, { required: true }),

    // Optional fields
    trackTraceUrl: notNullString('trackTraceUrl', ''),
    shippedFromCountryCode: notNullString('shippedFromCountryCode', 'SA'),

    // Product lines to ship
    products: z
      .array(
        z.object({
          merchantProductNo: notNullString('merchantProductNo', undefined, { required: true }),
          orderLineId: safeNumber('orderLineId', 0, { required: true }),
          quantity: safeNumber('quantity', 0, { required: true }),
        })
      )
      .nonempty({ message: 'products must contain at least one item' }),
  });

  return bodySchema.parse(req.body);
});
