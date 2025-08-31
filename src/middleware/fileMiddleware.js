import Responses from '../helpers/response.js';

/*FUNC TO VERIFY A TOKEN FOR USER*/
export const validateFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return Responses.failResponse(res, 'CSV file is required!', 400);
    }

    // Check MIME type & extension
    const isCSV = req.file.mimetype === 'text/csv' || req.file.originalname.toLowerCase().endsWith('.csv');

    if (!isCSV) {
      return Responses.failResponse(res, 'Only CSV files are allowed!', 400);
    }

    next();
  } catch (error) {
    return Responses.errorResponse(res, error.message);
  }
};
