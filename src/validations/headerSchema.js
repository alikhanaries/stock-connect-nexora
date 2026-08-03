import { z } from 'zod';
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
        invalid_type_error: 'Accept-Language must be a string',
      })
      .optional()
      .superRefine((val, ctx) => {
        if (!val) return;

        const primary = val.split(',')[0]?.trim();
        const base = primary?.split('-')[0];
        const isSupported =
          LANGUAGE_CODES.includes(val) || LANGUAGE_CODES.includes(primary) || LANGUAGE_CODES.includes(base);

        if (!isSupported) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Accept-Language '${val}' is not supported. Supported languages: ${LANGUAGE_CODES.join(', ')}`,
            path: ['accept-language'],
          });
        }
      }),
  })
  .passthrough();
