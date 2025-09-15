import mongoose from 'mongoose';
import { z, ZodError } from 'zod';

import { errorResponse } from '#helpers/response.js';
import { LANGUAGE_CODES, PRODUCT_STATUSES } from '#constants/common.js';

const validate = (parseFn) => async (req, res, next) => {
  try {
    await parseFn(req);
    return next();
  } catch (error) {
    console.error('Validation error:', error);
    const message =
      error instanceof ZodError ? error.issues[0]?.message || 'Invalid input' : error.message || 'Server Error';
    return errorResponse(res, message, 400);
  }
};

export const headerSchema = z
  .object({
    authorization: z
      .string({
        required_error: 'Authorization header is required',
        invalid_type_error: 'Authorization must be a string',
      })
      // .nonempty('accept-language cannot be empty2'),
      .nonempty('Authorization header cannot be empty'),
    'accept-language': z
      .string({
        invalid_type_error: 'Accept-Language must be a string',
      })
      .optional()
      .superRefine((val, ctx) => {
        if (val && !LANGUAGE_CODES.includes(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Accept-Language '${val}' is not supported. Supported languages: ${LANGUAGE_CODES.join(', ')}`,
            path: ['accept-language'],
          });
        }
      }),
  })
  .passthrough();

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

  const paramsSchema = z.object({
    id: objectIdSchema,
  });
  paramsSchema.parse(req.params);
});

export const UpdateSellerStatusValidator = validate(async (req) => {
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
