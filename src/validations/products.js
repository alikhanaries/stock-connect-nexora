import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */
export const addProductsToUserChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  // Body schema
  const bodySchema = z
    .object({
      userId: z
        .string({
          required_error: 'userId is required',
          invalid_type_error: 'userId must be a string',
        })
        .length(24, 'userId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'userId must be a hex string'),

      channelId: z.number({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a number',
      }),

      productsList: z
        .array(
          z.object({
            skuCode: z.string({
              required_error: 'skuCode is required',
              invalid_type_error: 'skuCode must be a string',
            }),
            skuId: z.string({
              required_error: 'skuId is required',
              invalid_type_error: 'skuId must be a string',
            }),
          })
        )
        .nonempty('productsList cannot be empty'),
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
