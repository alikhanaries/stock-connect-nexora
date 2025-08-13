import { ZodError } from "zod";

export const validateInput = (schema) => (req, res, next) => {
  try {
    const validatedData = schema.parse(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    return res.status(400).json({ errors: "Invalid input" });
  }
};
