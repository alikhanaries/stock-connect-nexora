import Responses from '../helpers/response.js';

/*FUNC TO VERIFY A TOKEN FOR USER*/
export const validateFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return Responses.failResponse(res, 'CSV file is required!', 400);
    }

    const allowedMimes = ['text/csv', 'application/vnd.ms-excel'];
    const isCSV = allowedMimes.includes(req.file.mimetype) || req.file.originalname.toLowerCase().endsWith('.csv');

    if (!isCSV) {
      return Responses.failResponse(res, 'Only CSV files are allowed!', 400);
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (req.file.size > MAX_SIZE) {
      return Responses.failResponse(res, 'CSV file is too large!', 400);
    }

    next();
  } catch (error) {
    return Responses.errorResponse(res, error.message);
  }
};
