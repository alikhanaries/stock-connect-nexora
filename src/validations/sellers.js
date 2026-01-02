import mongoose from 'mongoose';
import { z } from 'zod';
import { PRODUCT_STATUSES } from '#constants/common.js';
import { validate } from './validate.js';
import { headerSchema } from './headerSchema.js';

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ID format. Must be a 24-character hexadecimal string.',
});

export const createSellerValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const bodySchema = z
    .object({
      name: z
        .string({ required_error: 'Name is required' })
        .min(1, { message: 'Name must be at least 1 character long' }),

      shopifyStoreUrl: z
        .string({ required_error: 'url is required' })
        .url({ message: 'url must be a valid URL' })
        .regex(/^https:\/\/.+\.myshopify\.com$/, 'Invalid Shopify store URL')
        .optional(),

      shopifyApiVersion: z
        .string({ required_error: 'apiVersion is required' })
        .min(1, { message: 'apiVersion is required' })
        .optional(),

      shopifyAccessToken: z
        .string({ required_error: 'accessToken is required' })
        .min(1, { message: 'accessToken is required' })
        .optional(),
    })
    .refine(
      (data) =>
        // either all 3 are present or none
        (!data.shopifyStoreUrl && !data.shopifyApiVersion && !data.shopifyAccessToken) ||
        (data.shopifyStoreUrl && data.shopifyApiVersion && data.shopifyAccessToken),
      {
        message: 'shopifyStoreUrl, shopifyApiVersion and shopifyAccessToken must be provided together',
        path: ['shopifyStorUrl'],
      }
    );

  await bodySchema.parseAsync(req.body);
});

export const getAllSellerValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const querySchema = z.object({
    page: z.coerce.number().int().positive().optional(),
    size: z.coerce.number().int().positive().optional(),
    search: z.string().optional(),
  });

  await querySchema.parseAsync(req.query);
});

export const updateSellerValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const paramsSchema = z.object({
    id: objectIdSchema,
  });
  await paramsSchema.parseAsync(req.params);

  const bodySchema = z
    .object({
      name: z.string().min(1).optional(),

      shopifyStoreUrl: z
        .string()
        .url({ message: 'url must be a valid URL' })
        .regex(/^https:\/\/.+\.myshopify\.com$/, 'Invalid Shopify store URL')
        .optional(),

      shopifyApiVersion: z.string().min(1).optional(),

      shopifyAccessToken: z.string().min(1).optional(),
    })
    .refine(
      (data) =>
        // either all 3 provided or none
        (!data.shopifyStoreUrl && !data.shopifyApiVersion && !data.shopifyAccessToken) ||
        (data.shopifyStoreUrl && data.shopifyApiVersion && data.shopifyAccessToken),
      {
        message: 'shopifyStoreUrl, shopifyApiVersion and shopifyAccessToken must be provided together',
        path: ['shopifyStoreUrl'],
      }
    );

  await bodySchema.parseAsync(req.body);
});

export const softDeleteSellerValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const bodySchema = z.object({
    ids: z.array(objectIdSchema).nonempty({ message: 'Please provide at least one seller ID.' }),
  });
  bodySchema.parse(req.body);
});

export const updateSellerStatusValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const bodySchema = z.object({
    ids: z.array(objectIdSchema).nonempty({ message: 'Please provide at least one seller ID.' }),

    status: z.enum(PRODUCT_STATUSES, {
      required_error: 'Status is required.',
      invalid_type_error: `Invalid status. Please use one of: ${PRODUCT_STATUSES.join(', ')}`,
    }),
  });
  await bodySchema.parseAsync(req.body);
});

export const getSellerByIdValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const paramsSchema = z.object({
    id: objectIdSchema,
  });
  await paramsSchema.parseAsync(req.params);
});

export const getAllPickupAddressesValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);
});

export const savePickupAddressValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const bodySchema = z.object({
    email: z.string({ required_error: 'email is required' }).email({ message: 'Invalid email address' }),
    city: z.string().optional(),
    address: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
    phone: z
      .string()
      .optional()
      .refine((val) => !val || /^[0-9]{5,15}$/.test(val), {
        message: 'phone must contain only digits (5-15 characters)',
      }),
    description: z.string().optional(),
  });
  await bodySchema.parseAsync(req.body);
});

export const getAymaknCityValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);
});

export const updatePickupAddressValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const paramsSchema = z.object({
    id: objectIdSchema,
  });
  await paramsSchema.parseAsync(req.params);

  const bodySchema = z
    .object({
      email: z.string().email({ message: 'Invalid email address' }).optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
      phone: z
        .string()
        .optional()
        .refine((val) => !val || /^[0-9]{5,15}$/.test(val), {
          message: 'phone must contain only digits (5-15 characters)',
        }),
      description: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    });

  await bodySchema.parseAsync(req.body);
});

export const deletePickupAddressValidator = validate(async (req) => {
  await headerSchema.parseAsync(req.headers);

  const paramsSchema = z.object({
    id: objectIdSchema,
  });

  await paramsSchema.parseAsync(req.params);
});
