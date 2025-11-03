/*FUNC- TO SEND THE SUCCESS RESPONSE*/
export const successResponse = (res, message = 'Success', statusCode = 200, data = null) => {
  return res.status(statusCode).send({
    error: false,
    success: true,
    message: message,
    statusCode,
    data,
  });
};
/*FUNC- TO SEND THE FAIL RESPONSE*/
export const failResponse = (res, message = 'Request failed', statusCode = 400, data = null) => {
  return res.status(statusCode).send({
    error: false,
    success: false,
    message: message,
    statusCode,
    data,
  });
};

/*FUNC- TO ERROR THE FAIL RESPONSE*/
export const errorResponse = (res, errorDesc, statusCode = 500) => {
  return res.status(statusCode).send({
    error: true,
    success: false,
    message: errorDesc,
    statusCode,
    data: null,
  });
};

export default { successResponse, failResponse, errorResponse };
