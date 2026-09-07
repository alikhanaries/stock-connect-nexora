import { z, ZodError } from 'zod';
import Response from '#helpers/response.js';

export const objectIdSchema = z
  .string({ required_error: 'ID is required' })
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const isBodySchema = (input) => input && typeof input.parse === 'function';

const resolveSchemas = (input) => {
  if (isBodySchema(input)) {
    return { body: input };
  }
  return input || {};
};

export const validateInput = (input) => (req, res, next) => {
  try {
    const schemas = resolveSchemas(input);

    if (schemas.body) {
      req.body = schemas.body.parse(req.body ?? {});
    }

    if (schemas.query) {
      req.validatedQuery = schemas.query.parse(req.query ?? {});
    }

    if (schemas.params) {
      req.validatedParams = schemas.params.parse(req.params ?? {});
    }

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const firstErrorMessage = error.issues[0]?.message || 'Invalid input';
      return Response.failResponse(res, firstErrorMessage, 400);
    }
    return Response.failResponse(res, 'An unexpected server error occurred', 500);
  }
};
