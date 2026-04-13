import { z } from 'zod';
import { headerSchema, validate } from './auth.js';

const orderItemIdsSchema = z
  .object({
    orderItemIds: z.string({ required_error: 'orderItemIds is required' }).nonempty('orderItemIds cannot be empty'),
  })
  .passthrough();

export const getLabelsValidator = validate(async (req) => {
  headerSchema.parse(req.headers);
  Object.assign(req.query, orderItemIdsSchema.parse(req.query));
});
