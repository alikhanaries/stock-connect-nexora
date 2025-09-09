import { z } from 'zod';
import { validate } from './validate.js';
// Common language list
import { LANGUAGE_CODES } from '#constants/common.js';

export const headerSchema = z
  .object({
    authorization: z
      .string({
        required_error: 'Authorization header is required',
        invalid_type_error: 'Authorization must be a string',
      })
      // .nonempty('accept-language cannot be empty2'),
      .nonempty('Authorization header cannot be empty'),

    'accept-language': z
      .string({
        required_error: 'Accept-Language header is required',
        invalid_type_error: 'Accept-Language must be a string',
      })
      .nonempty('accept-language cannot be empty')
      .superRefine((val, ctx) => {
        if (!LANGUAGE_CODES.includes(val)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Accept-Language '${val}' is not supported. Supported languages: ${LANGUAGE_CODES.join(', ')}`,
            path: ['accept-language'],
          });
        }
      }),
  })
  .passthrough();

/* GET USER CHANNEL LIST VALIDATOR */
export const getAllUserChannelsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const paramsSchema = z.object({
    userId: z
      .string()
      .length(24, 'userId must be 24 characters long')
      .regex(/^[0-9a-fA-F]+$/, 'userId must be a hex string'),
  });
  paramsSchema.parse(req.params);
  // validate query (for pagination + search)
  const querySchema = z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, { message: 'page must be greater than 0' }),

    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .refine((val) => val > 0 && val <= 100, { message: 'limit must be between 1 and 100' }),

    search: z.string().optional(),
  });

  querySchema.parse(req.query);
});
// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER VALIDATOR */
export const getAllChannelsFromChannelPartnerValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
});
// /* GET ALL CHANNEL LIST FROM DATABASE VALIDATOR */
export const getAllChannelsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
});
// /* SAVE USER CHANNELS VALIDATOR */
export const saveUserChannelsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  // Body schema
  const bodySchema = z
    .object({
      userId: z
        .string({
          required_error: 'userId is required',
          invalid_type_error: 'userId must be a string',
        })
        .refine((val) => val.length === 24, {
          message: 'userId must be 24 characters long',
        })
        .refine((val) => /^[0-9a-fA-F]+$/.test(val), {
          message: 'userId must be a hex string',
        }),

      channelIds: z
        .array(
          z
            .string()
            .length(24, 'Each channelId must be 24 characters') // ObjectId length
            .regex(/^[0-9a-fA-F]+$/, 'Each channelId must be a hex string')
        )
        .min(1, 'channelIds must not be empty')
        .refine((arr) => new Set(arr).size === arr.length, 'channelIds must be unique'),
    })
    .strict();
  bodySchema.parse(req.body);
});
