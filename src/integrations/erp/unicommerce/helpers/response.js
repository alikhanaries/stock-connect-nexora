/*FUNC- TO SEND THE SUCCESS RESPONSE*/
export const successResponse = (res, statusCode = 200, data = {}) => {
  return res.status(statusCode).json(data);
};
/*FUNC- TO SEND THE FAIL RESPONSE*/
export const failResponse = (res, statusCode = 400, data = { message: 'Request failed' }) => {
  return res.status(statusCode).json(data);
};

/*FUNC- TO ERROR THE FAIL RESPONSE*/
export const errorResponse = (res, statusCode = 500, errorDesc) => {
  return res.status(statusCode).json(errorDesc ?? { message: 'Something went wrong' });
};

export default { successResponse, failResponse, errorResponse };
