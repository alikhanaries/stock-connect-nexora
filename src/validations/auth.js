import { z } from 'zod';
import { validate } from './validate.js';
import { LANGUAGE_CODES, USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';
const allowedRoles = Object.values(USER_ROLES);

const emailSchema = z
  .string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  })
  .nonempty('Email cannot be empty')
  .email('Invalid email address format')
  .toLowerCase()
  .trim();

const passwordSchema = z
  .string({
    required_error: 'Password is required',
    invalid_type_error: 'Password must be a string',
  })
  .nonempty('Password cannot be empty')
  .min(6, 'Password must be at least 6 characters long')
  .max(128, 'Password must not exceed 128 characters');

const nameSchema = (field) =>
  z
    .string({
      required_error: `${field} is required`,
      invalid_type_error: `${field} must be a string`,
    })
    .nonempty(`${field} cannot be empty`)
    .min(1, `${field} must be at least 1 character long`)
    .max(50, `${field} must not exceed 50 characters`)
    .trim();

const phoneSchema = z
  .string({
    required_error: 'Phone number is required',
    invalid_type_error: 'Phone number must be a string',
  })
  .nonempty('Phone number cannot be empty')
  .min(10, 'Phone number must be at least 10 digits long')
  .max(15, 'Phone number must not exceed 15 digits')
  .regex(/^[+]?[\d\s\-()]+$/, 'Invalid phone number format')
  .trim();

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ID format',
});

export const headerSchema = z
  .object({
    authorization: z
      .string({
        required_error: 'Authorization header is required',
        invalid_type_error: 'Authorization must be a string',
      })
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

export const loginValidator = validate(async (req) => {
  const bodySchema = z
    .object({
      email: emailSchema,
      password: passwordSchema,
    })
    .strict();

  bodySchema.parse(req.body);
});

export const registerValidator = validate(async (req) => {
  const bodySchema = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      firstName: nameSchema('First name'),
      lastName: nameSchema('Last name'),
      phoneNumber: phoneSchema,
      role: z.enum(allowedRoles, {
        required_error: 'Role is required',
        invalid_type_error: `Invalid role. Please select one of: ${allowedRoles.join(', ')}`,
      }),
      active: z.boolean({ invalid_type_error: 'Active must be a boolean' }).optional().default(true),
      sellerId: objectIdSchema.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.role !== USER_ROLES.PLATFORM_MASTER && !data.sellerId) {
        ctx.addIssue({
          path: ['sellerId'],
          message: 'Seller ID is required for this role.',
          code: z.ZodIssueCode.custom,
        });
      }
    });

  await bodySchema.parseAsync(req.body);
});

export const resetTokenValidator = validate(async (req) => {
  const bodySchema = z
    .object({
      resetToken: z
        .string({
          required_error: 'Token is required',
          invalid_type_error: 'Token must be a string',
        })
        .nonempty('Token cannot be empty'),
    })
    .strict();

  bodySchema.parse(req.body);
});

export const resetPasswordValidator = validate(async (req) => {
  const bodySchema = z

    .object({
      resetToken: z
        .string({
          required_error: 'Token is required',
          invalid_type_error: 'Token must be a string',
        })
        .nonempty('Token cannot be empty'),
      newPassword: passwordSchema,
    })
    .strict()
    .refine((data) => data.oldPassword !== data.newPassword, {
      message: 'New password cannot be the same as old password',
      path: ['newPassword'],
    });

  bodySchema.parse(req.body);
});

export const forgetPasswordValidator = validate(async (req) => {
  const bodySchema = z.object({
    email: emailSchema,
  });

  bodySchema.parse(req.body);
});
