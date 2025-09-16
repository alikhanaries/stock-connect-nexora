import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */
export const addProductsToUserChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Validate body
  const bodySchema = z
    .object({
      ids: z
        .array(
          z
            .string()
            .length(24, 'productId must be exactly 24 characters') // ObjectId length
            .regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId format') // hex validation
        )
        .nonempty('productIds cannot be empty')
        .refine(
          (ids) => new Set(ids).size === ids.length, // check for uniqueness
          { message: 'Duplicate productIds are not allowed' }
        ),
    })
    .strict();

  // Validate params
  const paramsSchema = z.object({
    id: z
      .string({
        required_error: 'id is required',
        invalid_type_error: 'id must be a string',
      })
      .regex(/^\d+$/, 'id must be a number string')
      .transform((val) => parseInt(val, 10)),
  });

  bodySchema.parse(req.body);
  paramsSchema.parse(req.params);
});

// /* GET PRODUCTS VALIDATOR */
export const getProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      page: z
        .string()
        .regex(/^\d+$/, 'page must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'page must be at least 1' })
        .optional(),

      size: z
        .string()
        .regex(/^\d+$/, 'size must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'size must be at least 1' })
        .optional(),

      status: z
        .string()
        .toLowerCase()
        .refine((val) => ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        })
        .optional(),

      minPrice: z
        .string()
        .regex(/^\d+$/, 'minPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'minPrice cannot be negative' })
        .optional(),

      maxPrice: z
        .string()
        .regex(/^\d+$/, 'maxPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'maxPrice cannot be negative' })
        .optional(),

      search: z.string().optional(),

      sortBy: z.string().optional(),

      sortOrder: z
        .string()
        .toLowerCase()
        .refine((val) => ['asc', 'desc'].includes(val), {
          message: "sortOrder must be either 'asc' or 'desc'",
        })
        .optional(),
    })
    .strict();

  querySchema.parse(req.query);
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

// /* UPDATE PRODUCT STATUS VALIDATOR */
export const updateProductStatusValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z
    .object({
      ids: z
        .array(
          z
            .string()
            .length(24, 'Each productId must be exactly 24 characters')
            .regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId format')
        )
        .nonempty('Product IDs cannot be empty')
        .refine((ids) => new Set(ids).size === ids.length, {
          message: 'Duplicate productIds are not allowed',
        }),

      status: z
        .string({
          required_error: 'status is required',
          invalid_type_error: 'status must be a string',
        })
        .toLowerCase()
        .refine((val) => ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        }),
    })
    .strict();

  bodySchema.parse(req.body);
});

// /* GET TOP SELLING PRODUCT VALIDATOR */
export const getTopSellingProductValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      size: z
        .string()
        .regex(/^\d+$/, 'size must be a number string')
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().min(1, 'size must be at least 1'))
        .optional(),

      channel: z.string().optional(),
    })
    .strict();

  querySchema.parse(req.query);
});

// /* DELETE PRODUCT BY ID VALIDATOR */
export const deleteProductValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

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

// /* PUSH PRODUCTS TO CHANNELENGINE VALIDATOR */
export const pushProductsToChannelEngineValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    channelId: z
      .number({
        required_error: "channelId is required",
        invalid_type_error: "channelId must be a number",
      })
      .int("channelId must be an integer")
      .positive("channelId must be positive"),
  });

  paramsSchema.parse(req.params);
});
// /* GET USER CHANNEL PRODUCTS VALIDATOR */
export const getUserChannelProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    channelId: z
      .string({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a string',
      })
      .regex(/^\d+$/, 'channelId must be a number string')
      .transform((val) => parseInt(val, 10)),
  });
  paramsSchema.parse(req.params);

  const querySchema = z
    .object({
      page: z
        .string()
        .regex(/^\d+$/, 'page must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'page must be at least 1' })
        .optional(),

      size: z
        .string()
        .regex(/^\d+$/, 'size must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'size must be at least 1' })
        .optional(),

      status: z
        .string()
        .optional()
        .transform((val) => (val ? val.toLowerCase() : val))
        .refine((val) => !val || ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        }),

      minPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'minPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'minPrice cannot be negative' })
        .optional(),

      maxPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'maxPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'maxPrice cannot be negative' })
        .optional(),

      search: z.string().optional(),

      sortBy: z.string().optional(),

      sortOrder: z
        .string()
        .optional()
        .transform((val) => (val ? val.toLowerCase() : val))
        .refine((val) => !val || ['asc', 'desc'].includes(val), {
          message: "sortOrder must be either 'asc' or 'desc'",
        }),
    })
    .strict();

  querySchema.parse(req.query);
});

// /* GET USER UNASSIGNED PRODUCTS VALIDATOR */
export const getUserUnassignedProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    channelId: z
      .string({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a string',
      })
      .regex(/^\d+$/, 'channelId must be a number string')
      .transform((val) => parseInt(val, 10)),
  });
  paramsSchema.parse(req.params);

  const querySchema = z
    .object({
      page: z
        .string()
        .regex(/^\d+$/, 'page must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'page must be at least 1' })
        .optional(),

      size: z
        .string()
        .regex(/^\d+$/, 'size must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, { message: 'size must be at least 1' })
        .optional(),

      status: z
        .string()
        .optional()
        .transform((val) => (val ? val.toLowerCase() : val))
        .refine((val) => !val || ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        }),

      minPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'minPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'minPrice cannot be negative' })
        .optional(),

      maxPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'maxPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'maxPrice cannot be negative' })
        .optional(),

      search: z.string().optional(),

      sortBy: z.string().optional(),

      sortOrder: z
        .string()
        .optional()
        .transform((val) => (val ? val.toLowerCase() : val))
        .refine((val) => !val || ['asc', 'desc'].includes(val), {
          message: "sortOrder must be either 'asc' or 'desc'",
        }),
    })
    .strict();

  querySchema.parse(req.query);
});
