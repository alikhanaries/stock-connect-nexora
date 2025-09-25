import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */

// Category item schema
const categoryItemSchema = z.object({
  platformCategoryId: z
    .number({
      required_error: 'platformCategoryId is required',
      invalid_type_error: 'platformCategoryId must be a number',
    })
    .int('platformCategoryId must be an integer')
    .min(1, 'platformCategoryId must be greater than 0'),
  marketplaceCategoryId: z
    .number({
      required_error: 'marketplaceCategoryId is required',
      invalid_type_error: 'marketplaceCategoryId must be a number',
    })
    .int('marketplaceCategoryId must be an integer')
    .min(1, 'marketplaceCategoryId must be greater than 0'),
});

export const addCategoryValidator = validate(async (req) => {
  // Validate headers
  //headerSchema.parse(req.headers);

  // Validate body

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
