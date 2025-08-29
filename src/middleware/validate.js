import { ZodError } from 'zod';
import Response from '#helpers/response.js';

export const validateInput = (schema) => (req, res, next) => {
  try {
    const validatedData = schema.parse(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const firstErrorMessage = error.issues[0]?.message || 'Invalid input';
      return Response.failResponse(res, firstErrorMessage, 400);
    }
    return Response.failResponse(res, 'An unexpected server error occurred', 500);
  }
};
