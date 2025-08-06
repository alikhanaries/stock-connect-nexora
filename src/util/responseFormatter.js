export const formatErrorResponse = (
  message = "Error",
  statusCode = 500,
  errors = {}
) => {
  return {
    success: false,
    message,
    statusCode,
    ...(Object.keys(errors).length > 0 ? errors : {}),
  };
};

export const formatSuccessResponse = (
  responseData,
  message = "Operation successful"
) => {
  return {
    success: true,
    message,
    ...(responseData || {}),
  };
};
