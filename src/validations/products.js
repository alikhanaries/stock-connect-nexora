import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */
export const addProductsToUserChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  // Body schema
  const bodySchema = z
    .object({
      channelId: z.number({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a number',
      }),
      productIds: z
        .array(
          z
            .string()
            .length(24, 'productId must be exactly 24 characters') // ensures fixed length
            .regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId format') // ensures valid hex
        )
        .nonempty('productIds cannot be empty')
        .refine(
          (ids) => new Set(ids).size === ids.length, // ensures uniqueness
          { message: 'Duplicate productIds are not allowed' }
        ),
    })
    .strict();

  bodySchema.parse(req.body);
});

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
