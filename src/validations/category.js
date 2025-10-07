import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */
// Category item schema

export const importMarketPlaceCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Validate params
  const paramsSchema = z.object({
    marketPlaceId: z
      .string({
        required_error: 'marketPlaceId is required',
        invalid_type_error: 'marketPlaceId must be a string',
      })
      .regex(/^\d+$/, 'marketPlaceId must be a number string')
      .transform((val) => parseInt(val, 10)),
  });

  paramsSchema.parse(req.params);
});

// /* SAVE USER CHANNELS VALIDATOR */
// Category item schema
const categoryItemSchema = z.object({
  platformCategoryId: z
    .number({
      required_error: 'marketplaceCategoryId is required',
      invalid_type_error: 'marketplaceCategoryId must be a number',
    })
    .int('marketplaceCategoryId must be an integer')
    .min(1, 'marketplaceCategoryId must be greater than 0'),
  marketplaceCategoryId: z
    .number({
      required_error: 'marketplaceCategoryId is required',
      invalid_type_error: 'marketplaceCategoryId must be a number',
    })
    .int('marketplaceCategoryId must be an integer')
    .min(1, 'marketplaceCategoryId must be greater than 0'),
});

export const mapCategoryValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string'),
  });
  paramsSchema.parse(req.params);
  // Main body schema
  const bodySchema = z
    .object({
      marketPlaceId: z
        .number({
          required_error: 'marketPlaceId is required',
          invalid_type_error: 'marketPlaceId must be a number',
        })
        .int('marketPlaceId must be an integer')
        .min(1, 'marketPlaceId must be greater than 0'),

      categoryDatas: z
        .array(categoryItemSchema)
        .nonempty('categoryDatas cannot be empty')
        .refine(
          (categories) => {
            const seen = new Set();
            for (const { platformCategoryId, marketplaceCategoryId } of categories) {
              const key = `${platformCategoryId}-${marketplaceCategoryId}`;
              if (seen.has(key)) return false;
              seen.add(key);
            }
            return true;
          },
          { message: 'Duplicate category mappings are not allowed' }
        ),
    })
    .strict();

  bodySchema.parse(req.body);
});
export const getMarketPlaceCategoryTrailsValidator = validate(async (req) => {
  // Validate headers
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string'),
  });
  paramsSchema.parse(req.params);
});
export const getStockConnectCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    sellerId: z
      .string()
      .length(24, 'sellerId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string'),
  });
  paramsSchema.parse(req.params);
  // Schema for req.query
  const querySchema = z.object({
    search: z.string().optional().default(''),
  });
  querySchema.parse(req.query);
});

export const getMarketplaceCategoriesValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  // Schema for req.query
  const querySchema = z.object({
    search: z.string().optional().default(''),
  });
  querySchema.parse(req.query);

  // Schema for req.params
  const paramsSchema = z.object({
    marketPlaceId: z
      .string({
        required_error: 'marketPlaceId is required',
        invalid_type_error: 'marketPlaceId must be a string',
      })
      .regex(/^[1-9]\d*$/, 'marketPlaceId must be a positive number string'),
  });

  paramsSchema.parse(req.params);
});
