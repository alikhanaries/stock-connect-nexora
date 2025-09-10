import { z, ZodError } from 'zod';
import { errorResponse } from '#helpers/response.js';
// Common language list
import { LANGUAGE_CODES, USER_ROLES } from '#constants/common.js';

const allowedRoles = Object.values(USER_ROLES);
import mongoose from 'mongoose';
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

export const userIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    id: z
      .string()
      .length(24, 'userId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'userId must be a hex string'),
  });
  paramsSchema.parse(req.params);
});

export const getAllUsersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, { message: 'page must be greater than 0' }),

    size: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine((val) => val > 0 && val <= 100, { message: 'limit must be between 1 and 100' }),

    search: z.string().optional(),

    active: z
      .enum(['true', 'false'], {
        errorMap: () => ({ message: "Status must be 'true' or 'false'" }),
      })
      .transform((value) => value === 'true')
      .optional(),

    role: z
      .enum(['admin', 'super_admin'], {
        errorMap: () => ({ message: "Role must be either 'admin' or 'super_admin'" }),
      })
      .optional(),
  });
  querySchema.parse(req.query);
});

export const updatePasswordValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const passwordSchema = z
    .object({
      oldPassword: z.string().min(1, { message: 'Old password is required' }),
      newPassword: z.string().min(6, { message: 'New password must be at least 6 characters long' }),
    })
    .refine((data) => data.oldPassword !== data.newPassword, {
      message: 'New password must be different from the old password.',
      path: ['newPassword'],
    });
  passwordSchema.parse(req.body);
});

export const bulkDeleteUsersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const bulkDeleteUsersSchema = z.object({
    ids: z
      .array(z.string(), {
        required_error: 'An array of user IDs is required.',
        invalid_type_error: 'IDs must be an array of strings.',
      })
      .nonempty({
        message: 'The IDs array cannot be empty.',
      })
      .refine((ids) => ids.every((id) => mongoose.Types.ObjectId.isValid(id)), {
        message: 'One or more provided IDs are not valid ObjectIds.',
      }),
  });
  return bulkDeleteUsersSchema.parse(req.body);
});

export const updateSelectedUserStatusValidator = validate(async (req) => {
  const bulkUpdateStatusSchema = z.object({
    ids: z
      .array(z.string(), {
        required_error: 'An array of user IDs is required.',
        invalid_type_error: 'IDs must be an array of strings.',
      })
      .nonempty({
        message: 'The IDs array cannot be empty.',
      })
      .refine((ids) => ids.every((id) => mongoose.Types.ObjectId.isValid(id)), {
        message: 'One or more provided IDs are not valid ObjectIds.',
      }),
    status: z.coerce.boolean({
      required_error: 'A status (true or false) is required.',
    }),
  });
  return bulkUpdateStatusSchema.parse(req.body);
});

export const updateUserValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const updateUserSchema = z.object({
    firstName: z.string().min(1, 'First name cannot be empty').optional(),
    lastName: z.string().min(1, 'Last name cannot be empty').optional(),
    email: z.string().email('Invalid email address').optional(),
    phoneNumber: z
      .string()
      .regex(/^\d{10}$/, 'Phone number must be exactly 10 digits')
      .optional(),
    active: z.boolean().optional(),
    role: z
      .enum(allowedRoles, {
        message: `Invalid role. Please select one of: ${allowedRoles.join(', ')}`,
      })
      .optional(),
  });
  return updateUserSchema.parse(req.body);
});
