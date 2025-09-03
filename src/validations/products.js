import { z, ZodError } from 'zod';
import { languageTypes } from '#utils/languageTypes.js';
import { errorResponse } from '#helpers/response.js';
// Common language list

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
      //.nonempty('accept-language cannot be empty'),
      .nonempty('Authorization header cannot be empty'),
    'accept-language': z
      .string({
        required_error: 'Accept-Language header is required',
        invalid_type_error: 'Accept-Language must be a string',
      })
      .nonempty('accept-language cannot be empty')
      .superRefine((val, ctx) => {
        if (!languageTypes.includes(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Accept-Language '${val}' is not supported. Supported languages: ${languageTypes.join(', ')}`,
            path: ['accept-language'],
          });
        }
      }),
  })
  .passthrough();

// /* IMPORT PRODUCT BY GOOGLE SHEET VALIDATOR */
export const importProductsFromGoogleSheetValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z
    .object({
      url: z.any(), // temporarily accept anything
    })
    .strict()
    .refine((data) => data.url !== undefined && data.url !== null, {
      message: 'url is required',
      path: ['url'],
    })
    .refine((data) => typeof data.url === 'string', {
      message: 'url must be a string',
      path: ['url'],
    })
    .refine(
      (data) => {
        try {
          new URL(data.url); // check if valid URL
          return true;
        } catch {
          return false;
        }
      },
      {
        message: 'url must be a valid URL',
        path: ['url'],
      }
    );

  bodySchema.parse(req.body);
});
// /* IMPORT PRODUCTS BY CSV FILE VALIDATOR */
export const importProductsFromCsvFileValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
});
// /* DELETE MULTIPLE PRODUCTS VALIDATOR */
export const deleteMultipleProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  // Body schema
  const bodySchema = z
    .object({
      ids: z.any(), // temporarily accept anything
    })
    .strict()
    .refine((data) => Array.isArray(data.ids), {
      message: 'ids must be an array',
      path: ['ids'], // ensures the message is associated with the ids field
    })
    .refine((data) => Array.isArray(data.ids) && data.ids.length > 0, {
      message: 'ids must not be empty',
      path: ['ids'],
    })
    .refine((data) => Array.isArray(data.ids) && new Set(data.ids).size === data.ids.length, {
      message: 'ids must be unique',
      path: ['ids'],
    })
    .refine(
      (data) =>
        Array.isArray(data.ids) &&
        data.ids.every((id) => typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]+$/.test(id)),
      {
        message: 'Each ids must be a 24-character hex string',
        path: ['ids'],
      }
    );

  bodySchema.parse(req.body);
});
