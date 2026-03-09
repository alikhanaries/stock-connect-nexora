import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const getOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      pageNumber: z
        .string()
        .regex(/^\d+$/, 'pageNumber must be a number string')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val >= 1, {
          message: 'pageNumber must be at least 1',
        }),

      pageSize: z
        .string()
        .refine((val) => val === '50', {
          message: 'pageSize must be 50',
        })
        .transform(() => 50),

      startDate: z.string().datetime({ message: 'startDate must be ISO datetime' }).optional(),

      endDate: z.string().datetime({ message: 'endDate must be ISO datetime' }).optional(),

      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: 'startDate must be less than or equal to endDate',
        path: ['startDate'],
      }
    );

  Object.assign(req.query, querySchema.parse(req.query));
});

export const getOrderStatusValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      pageNumber: z
        .string()
        .regex(/^\d+$/, 'pageNumber must be a number string')
        .transform((v) => parseInt(v, 10))
        .refine((v) => v >= 1, {
          message: 'pageNumber must be at least 1',
        }),
      pageSize: z
        .string()
        .refine((v) => v === '5', {
          message: 'pageSize must be 5',
        })
        .transform(() => 5),
      orderIds: z.string().min(1, 'orderIds is required'),
    })
    .passthrough();

  Object.assign(req.query, querySchema.parse(req.query));
});

export const orderDispatchValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const bodySchema = z.object({
    orderItems: z
      .array(
        z.object({
          orderItemId: z.string().min(1, 'orderItemId is required').regex(/^\d+$/, 'orderItemId must be numeric'),

          quantity: z
            .number({
              required_error: 'quantity is required',
            })
            .int('quantity must be integer')
            .positive('quantity must be greater than 0'),
        })
      )
      .min(1, 'orderItems cannot be empty'),

    selfShipping: z.object({
      deliveryPartner: z.string().min(1).optional(),

      dispatchDate: z
        .string()
        .optional()
        .refine((date) => !date || !isNaN(Date.parse(date)), 'dispatchDate must be valid date'),

      invoiceNumber: z.string().optional(),

      trackingId: z
        .string({
          required_error: 'trackingId is required',
        })
        .min(1, 'trackingId is required'),

      trackingURL: z.string().url('trackingURL must be valid URL').optional(),
    }),
  });

  req.body = bodySchema.parse(req.body);
});
