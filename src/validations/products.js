import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */
export const addProductsToUserChannelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Validate body
  const idsArraySchema = z
    .array(
      z
        .string()
        .length(24, 'productId must be exactly 24 characters') // ObjectId length
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId format') // hex validation
    )
    .refine(
      (ids) => new Set(ids).size === ids.length, // check for uniqueness
      { message: 'Duplicate productIds are not allowed' }
    );

  const bodySchema = z
    .object({
      ids: z.union([idsArraySchema, z.undefined()]).optional(),
      addAll: z.boolean().optional(),
    })
    .strict()
    .refine(
      (data) => {
        if (data.addAll === true) {
          return true;
        }
        return data.ids && Array.isArray(data.ids) && data.ids.length > 0;
      },
      {
        message: 'Either ids array (non-empty) or addAll (true) must be provided',
      }
    );

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

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
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

      productType: z
        .string()
        .toLowerCase()
        .transform((val) => val.split(',').map((v) => v.trim().replace(/'/g, '')))
        .refine((arr) => arr.every((v) => ['simple', 'configurable'].includes(v)), {
          message: "Product Type must be 'simple', 'configurable' or comma-separated list of them",
        })
        .optional(),

      minStockCount: z
        .string()
        .regex(/^\d+$/, 'minStockCount must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'minStockCount cannot be negative' })
        .optional(),

      maxStockCount: z
        .string()
        .regex(/^\d+$/, 'maxStockCount must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'maxStockCount cannot be negative' })
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

      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

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
      message: 'The URL field is mandatory and cannot be left empty.',
      path: ['url'],
    })
    .refine((data) => typeof data.url === 'string', {
      message: 'The URL value must be provided as a valid string.',
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
        message: 'Please provide a valid URL to proceed.',
        path: ['url'],
      }
    );

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);

  bodySchema.parse(req.body);
});
// /* IMPORT PRODUCTS BY CSV FILE VALIDATOR */
export const importProductsFromCsvFileValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
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
  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
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
    .passthrough();

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
  bodySchema.parse(req.body);
});

// /* FREEZE / UNFREEZE PRODUCTS VALIDATOR */
export const freezeOrUnfreezeProductsValidator = validate(async (req) => {
  // validate headers
  headerSchema.parse(req.headers);
  // validate body
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

      isFrozen: z.boolean({
        required_error: 'isFrozen is required',
        invalid_type_error: 'isFrozen must be a boolean',
      }),
    })
    .strict();

  // validate query (optional sellerId)
  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]{24}$/, 'sellerId must be a valid ObjectId')
        .optional(),
    })
    .passthrough();

  bodySchema.parse(req.body);
  querySchema.parse(req.query);
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
    .passthrough();

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

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
  paramsSchema.parse(req.params);
});

// GET PRODUCT BY ID VALIDATOR
export const getProductByIdValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    id: z
      .string({
        required_error: 'id is required',
        invalid_type_error: 'id must be a string',
      })
      .length(24, 'id must be exactly 24 characters')
      .regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid hex string'),
  });

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
  paramsSchema.parse(req.params);
});

// /* PUSH PRODUCTS TO CHANNELENGINE VALIDATOR */
export const pushProductsToChannelEngineValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    channelId: z
      .string({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a string',
      })
      .regex(/^\d+$/, 'channelId must be a numeric string')
      .transform((val) => parseInt(val, 10)),
  });
  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);

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

      productType: z
        .string()
        .toLowerCase()
        .transform((val) => val.split(',').map((v) => v.trim().replace(/'/g, '')))
        .refine((arr) => arr.every((v) => ['simple', 'configurable'].includes(v)), {
          message: "Product Type must be 'simple', 'configurable' or comma-separated list of them",
        })
        .optional(),

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
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
});
export const unlinkProductFromChannelValidator = validate(async (req) => {
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

  const querySchema = z
    .object({
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
  paramsSchema.parse(req.params);
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

      productType: z
        .string()
        .toLowerCase()
        .transform((val) => val.split(',').map((v) => v.trim().replace(/'/g, '')))
        .refine((arr) => arr.every((v) => ['simple', 'configurable'].includes(v)), {
          message: "Product Type must be 'simple', 'configurable' or comma-separated list of them",
        })
        .optional(),

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
      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

  querySchema.parse(req.query);
});

// /* EXPORT PRODUCTS VALIDATOR */
export const exportProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    sellerId: z
      .string({
        required_error: 'sellerId is required',
        invalid_type_error: 'sellerId must be a string',
      })
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string'),
  });

  paramsSchema.parse(req.params);
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      status: z
        .string()
        .toLowerCase()
        .refine((val) => ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        })
        .optional(),

      minPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'minPrice must be a valid number')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'minPrice cannot be negative' })
        .optional(),

      maxPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/, 'maxPrice must be a valid number')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, { message: 'maxPrice cannot be negative' })
        .optional(),

      search: z.string().optional(),

      productSkuCode: z.string().optional(),

      sortBy: z.string().optional(),

      sortOrder: z
        .string()
        .toLowerCase()
        .refine((val) => ['asc', 'desc'].includes(val), {
          message: "sortOrder must be either 'asc' or 'desc'",
        })
        .optional(),

      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),

      filter: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        if (data.minPrice && data.maxPrice) {
          return parseFloat(data.minPrice) <= parseFloat(data.maxPrice);
        }
        return true;
      },
      {
        message: 'minPrice must be less than or equal to maxPrice',
      }
    );

  querySchema.parse(req.query);
});

export const syncProductsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    channel: z
      .string({
        required_error: 'channelId is required',
        invalid_type_error: 'channelId must be a string',
      })
      .regex(/^\d+$/, 'channelId must be a number string')
      .transform((val) => parseInt(val, 10)),
  });
  paramsSchema.parse(req.params);
});

// /* GET EXPRESS WAREHOUSE PRODUCTS VALIDATOR */
export const getExpressWareHouseProductsValidator = validate(async (req) => {
  // -----------------------------
  // HEADERS
  // -----------------------------
  headerSchema.parse(req.headers);

  // -----------------------------
  // PARAMS
  // -----------------------------
  const paramsSchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a valid hex string'),
  });

  paramsSchema.parse(req.params);

  // -----------------------------
  // QUERY
  // -----------------------------
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

      channelId: z
        .string()
        .length(24, 'channelId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'channelId must be a valid hex string')
        .optional(),

      status: z
        .string()
        .toLowerCase()
        .refine((val) => ['active', 'inactive'].includes(val), {
          message: "status must be either 'active' or 'inactive'",
        })
        .optional(),

      productType: z
        .string()
        .toLowerCase()
        .transform((val) => val.split(',').map((v) => v.trim().replace(/'/g, '')))
        .refine((arr) => arr.every((v) => ['simple', 'configurable'].includes(v)), {
          message: "productType must be 'simple', 'configurable' or comma-separated list",
        })
        .optional(),

      minStockCount: z
        .string()
        .regex(/^\d+$/, 'minStockCount must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, {
          message: 'minStockCount cannot be negative',
        })
        .optional(),

      maxStockCount: z
        .string()
        .regex(/^\d+$/, 'maxStockCount must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, {
          message: 'maxStockCount cannot be negative',
        })
        .optional(),

      minPrice: z
        .string()
        .regex(/^\d+$/, 'minPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, {
          message: 'minPrice cannot be negative',
        })
        .optional(),

      maxPrice: z
        .string()
        .regex(/^\d+$/, 'maxPrice must be a number string')
        .transform((val) => parseFloat(val))
        .refine((val) => val >= 0, {
          message: 'maxPrice cannot be negative',
        })
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

      filter: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .refine((data) => !(data.minPrice !== undefined && data.maxPrice !== undefined && data.minPrice > data.maxPrice), {
      message: 'minPrice cannot be greater than maxPrice',
      path: ['minPrice'],
    })
    .refine(
      (data) =>
        !(
          data.minStockCount !== undefined &&
          data.maxStockCount !== undefined &&
          data.minStockCount > data.maxStockCount
        ),
      {
        message: 'minStockCount cannot be greater than maxStockCount',
        path: ['minStockCount'],
      }
    )
    .passthrough();

  querySchema.parse(req.query);
});

export const translateProductFieldValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      sellerId: z
        .string({ required_error: 'sellerId query param is required' })
        .length(24, 'sellerId must be exactly 24 characters')
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid sellerId format'),
      productId: z
        .string()
        .length(24, 'productId must be exactly 24 characters')
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid productId format')
        .optional(),
    })
    .passthrough();
  querySchema.parse(req.query);

  const translateFieldsSchema = z
    .array(
      z
        .object({
          field: z.string({ required_error: 'field is required' }).min(1, 'field must not be empty'),
          lang: z.string({ required_error: 'lang is required' }).min(2).max(20),
        })
        .strict()
    )
    .refine(
      (arr) => new Set(arr.map((i) => `${i.field}:${i.lang}`)).size === arr.length,
      'duplicate field+lang combinations are not allowed in translateFields'
    )
    .optional();

  const bodySchema = z
    .object({
      action: z.enum(['start', 'cancel', 'pause', 'resume']).optional(),
      translateFields: translateFieldsSchema,
      enhanceImages: z.boolean().optional(),
      mapCategories: z.boolean().optional(),
    })
    .strict()
    .refine((b) => {
      // For cancel, scope is optional — omitting both means "cancel the whole job".
      if (b.action === 'cancel' || b.action === 'pause' || b.action === 'resume') return true;
      return (
        (Array.isArray(b.translateFields) && b.translateFields.length > 0) ||
        b.enhanceImages === true ||
        b.mapCategories === true
      );
    }, 'at least one of translateFields (non-empty), enhanceImages=true, or mapCategories=true must be provided');

  bodySchema.parse(req.body);
});
