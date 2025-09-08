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
