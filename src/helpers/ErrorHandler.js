import { formatErrorResponse } from "#util/responseFormatter.js";

export const errorHandler = (error, res) => {
  console.error("Error:", error.message || error);

  // Check for MongoDB duplicate key error
  if (error.code === 11000) {
    return res
      .status(409)
      .json(formatErrorResponse(`Duplicate is not allowed`, 409));
  }

  // Check for validation errors
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message);
    return res
      .status(400)
      .json(formatErrorResponse("Validation error", 400, { errors }));
  }

  // Check for Zod validation errors
  if (error.name === "ZodError") {
    const errors = error.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
    }));
    return res
      .status(400)
      .json(formatErrorResponse("Validation error", 400, { errors }));
  }

  // Handle cast errors (invalid ObjectId, etc.)
  if (error.name === "CastError") {
    return res.status(400).json(formatErrorResponse(`Invalid data`, 400));
  }

  // Handle JWT errors
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json(formatErrorResponse("Invalid token", 401));
  }

  // Handle expired JWT
  if (error.name === "TokenExpiredError") {
    return res.status(401).json(formatErrorResponse("Token expired", 401));
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json(formatErrorResponse("Payload too large", 413));
  }

  // Generic error response
  return res.status(500).json(formatErrorResponse("Server error", 500));
};
