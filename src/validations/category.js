import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
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

  // Validate body
  const bodySchema = z
    .object({
      marketPlaceId: z
        .number({
          required_error: 'marketplaceId is required',
          invalid_type_error: 'marketplaceId must be a number',
        })
        .int('marketplaceId must be an integer')
        .positive('marketplaceId must be a positive number'),
      categoryDatas: z
        .array(categoryItemSchema)
        .nonempty('categoryDatas cannot be empty')
        .refine(
          (categories) => {
            const seen = new Set();
            for (const { platformCategoryIdRef, marketplaceIdRef, marketplaceCategoryId } of categories) {
              const key = `${platformCategoryIdRef}-${marketplaceIdRef}-${marketplaceCategoryId}`;
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
