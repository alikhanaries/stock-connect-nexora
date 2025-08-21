/*FUNC- TO SEND THE SUCCESS RESPONSE*/
export const successResponse = (req, res, data, message, statusCode) => {
  return res.status(statusCode).send({
    error: false,
    success: true,
    message: message,
    data,
  });
};
/*FUNC- TO SEND THE FAIL RESPONSE*/
export const failResponse = (req, res, data, message, statusCode) => {
  return res.status(statusCode).send({
    error: false,
    success: false,
    message: message,
    data,
  });
};

/*FUNC- TO ERROR THE FAIL RESPONSE*/
export const errorResponse = (req, res, errorDesc, errorKey) => {
  const statusCode = errorKey ? errorKey : 500;
  return res.status(statusCode).send({
    error: true,
    success: false,
    message: errorDesc.message,
    data: null,
  });
};

export default { successResponse, failResponse, errorResponse };
