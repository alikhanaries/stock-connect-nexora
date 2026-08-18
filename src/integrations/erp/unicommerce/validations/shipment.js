import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

const orderItemIdsSchema = z
  .object({
    orderItemIds: z.string({ required_error: 'orderItemIds is required' }).nonempty('orderItemIds cannot be empty'),
  })
  .passthrough();

const orderItemTaxFieldsSchema = z.object({
  orderItemId: z.string({ required_error: 'orderItemId is required' }).min(1, 'orderItemId is required'),
  invoiceNumber: z.string().optional(),
  invoiceDate: z
    .string()
    .optional()
    .refine((date) => !date || !Number.isNaN(Date.parse(date)), 'invoiceDate must be a valid date'),
  taxRate: z.number().optional(),
  centralGstPercentage: z.number().optional(),
  compensationCessPercentage: z.number().optional(),
  integratedGstPercentage: z.number().optional(),
  stateGstPercentage: z.number().optional(),
  unionTerritoryGstPercentage: z.number().optional(),
});

export const getLabelsQueryValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  Object.assign(req.query, orderItemIdsSchema.parse(req.query));
});

export const postLabelsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);

  const bodySchema = z.object({
    boxHeight: z.number().optional(),
    boxLength: z.number().optional(),
    boxWidth: z.number().optional(),
    weight: z.number().optional(),
    orderItems: z.array(orderItemTaxFieldsSchema).min(1, 'orderItems must contain at least one item'),
  });

  req.body = bodySchema.parse(req.body);
});

export const getCourierDetailsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  Object.assign(req.query, orderItemIdsSchema.parse(req.query));
});
