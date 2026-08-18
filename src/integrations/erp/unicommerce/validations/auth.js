import { z } from 'zod';
import { LANGUAGE_CODES } from '#constants/common.js';
import { ZodError } from 'zod';

export const validate = (parseFn) => async (req, res, next) => {
  try {
    await parseFn(req);
    return next();
  } catch (error) {
    console.error('Validation error:', error);
    const message =
      error instanceof ZodError ? error.issues[0]?.message || 'Invalid input' : error.message || 'Server Error';
    return res.status(400).send({ message: message });
  }
};

const userNameSchema = z
  .string({
    required_error: 'UserName is required',
    invalid_type_error: 'UserName must be a string',
  })
  .nonempty('UserName cannot be empty')
  .email('UserName should be valid email address')
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

export const headerSchema = z
  .object({
    apikey: z
      .string({
        invalid_type_error: 'apiKey must be a string',
      })
      .nonempty('apiKey header cannot be empty')
      .optional(),

    authorization: z
      .string({
        invalid_type_error: 'Authorization must be a string',
      })
      .nonempty('Authorization header cannot be empty')
      .optional(),

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
  .passthrough()
  .refine((headers) => headers.apikey || headers.authorization, {
    message: 'apiKey header is required',
    path: ['apikey'],
  });

export const loginQueryValidator = validate(async (req) => {
  z.object({
    username: userNameSchema,
    password: passwordSchema,
  }).parse(req.query);
});

export const loginValidator = validate(async (req) => {
  const bodySchema = z
    .object({
      username: userNameSchema,
      password: passwordSchema,
    })
    .strict();

  bodySchema.parse(req.body);
});
