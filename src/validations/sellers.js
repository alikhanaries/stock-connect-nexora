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

  const bodySchema = z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(1, { message: 'Name must be at least 1 characters long' }),
  });

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

  const bodySchema = z.object({
    name: z.string().min(1).optional(),
  });
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
