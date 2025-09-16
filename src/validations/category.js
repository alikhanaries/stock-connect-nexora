import { z } from 'zod';
import { headerSchema } from './headerSchema.js';
import { validate } from './validate.js';
// /* SAVE USER CHANNELS VALIDATOR */

// ObjectId schema (24 hex chars)
const objectIdSchema = z
  .string()
  .length(24, 'Id must be exactly 24 characters')
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// Category item schema
const categoryItemSchema = z.object({
  platformCategoryIdRef: objectIdSchema,
  marketplaceIdRef: objectIdSchema,
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
