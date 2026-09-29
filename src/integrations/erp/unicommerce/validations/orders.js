import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

export const getOrdersValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const querySchema = z
    .object({
      pageNumber: z
        .union([z.string(), z.number()])
        .transform((val) => parseInt(String(val), 10))
        .refine((val) => !isNaN(val) && val >= 1, {
          message: 'pageNumber must be at least 1',
        }),

      pageSize: z
        .union([z.string(), z.number()])
        .transform((val) => parseInt(String(val), 10))
        .optional()
        .default(50),

      startDate: z.string().optional(),
      endDate: z.string().optional(),
      orderDateFrom: z.string().optional(),
      orderDateTo: z.string().optional(),

      sellerId: z
        .string()
        .length(24, 'sellerId must be 24 characters long')
        .regex(/^[0-9a-fA-F]+$/, 'sellerId must be a hex string')
        .optional(),
    })
    .passthrough();

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

const dispatchOrderItemSchema = z
  .object({
    orderItemId: z.string().min(1, 'orderItemId is required').regex(/^\d+$/, 'orderItemId must be numeric'),
    quantity: z.coerce
      .number({
        required_error: 'quantity is required',
        invalid_type_error: 'quantity must be a number',
      })
      .int('quantity must be integer')
      .positive('quantity must be greater than 0'),
  })
  .passthrough();

const selfShippingSchema = z.object({
  deliveryPartner: z.string().min(1).optional(),
  dispatchDate: z
    .string()
    .optional()
    .refine((date) => !date || !isNaN(Date.parse(date)), 'dispatchDate must be valid date'),
  invoiceNumber: z.string().optional(),
  trackingId: z.string().min(1, 'trackingId is required').optional(),
  trackingURL: z.string().url('trackingURL must be valid URL').optional(),
});

export const orderDispatchValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  const bodySchema = z
    .object({
      orderItems: z.array(dispatchOrderItemSchema).min(1, 'orderItems cannot be empty'),
      selfShipping: selfShippingSchema.optional(),
    })
    .superRefine((body, ctx) => {
      const trackingId = body.selfShipping?.trackingId?.trim();
      if (body.selfShipping && !trackingId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'trackingId is required when selfShipping is provided',
          path: ['selfShipping', 'trackingId'],
        });
      }
    });

  req.body = bodySchema.parse(req.body);
});

export const ordersValidator = async (req, res, next) => {
  try {
    // If orderIds exists → Order Status API
    if (req.query.orderIds) {
      return getOrderStatusValidator(req, res, next);
    }
    // Otherwise → Get Orders API
    return getOrdersValidator(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const orderStatusNotificationValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const paramsSchema = z.object({
    orderId: z.string().min(1, 'orderId is required'),
  });

  paramsSchema.parse(req.params);

  const orderItemSchema = z
    .object({
      orderItemId: z.string().min(1, 'orderItemId is required'),
      status: z.string().min(1, 'status is required'),
      IsReverse: z.boolean().optional(),
      isReverse: z.boolean().optional(),
      updated: z.string().min(1, 'updated is required'),
      courier_status: z.string().optional(),
      reversePickupCourierName: z.string().optional(),
      reversePickupCourierCode: z.string().optional(),
      returnAwb: z.string().optional(),
      returnAWB: z.string().optional(),
    })
    .refine((item) => typeof item.IsReverse === 'boolean' || typeof item.isReverse === 'boolean', {
      message: 'IsReverse is required',
    });

  const bodySchema = z.object({
    orderItems: z.array(orderItemSchema).min(1, 'orderItems cannot be empty'),
  });

  req.body = bodySchema.parse(req.body);
});

export const orderCancelValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    orderId: z.string().min(1, 'orderId is required'),

    orderItems: z
      .array(
        z.object({
          orderItemId: z.string().min(1, 'orderItemId is required'),
          productId: z.string().min(1, 'productId is required'),
          variantId: z.string().min(1, 'variantId is required'),
          quantity: z
            .number({
              required_error: 'quantity is required',
            })
            .int()
            .positive(),
        })
      )
      .min(1, 'orderItems must contain at least one item'),
  });

  req.body = bodySchema.parse(req.body);
});
