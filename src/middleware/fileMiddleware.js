import Responses from '../helpers/response.js';
import { safeUnlinkTempFile } from '../helpers/tempFileCleanup.js';

const rejectUploadedFile = async (req, res, message, status) => {
  if (req.file?.path) {
    await safeUnlinkTempFile(req.file.path);
  }
  return Responses.failResponse(res, message, status);
};

/*FUNC TO VERIFY A TOKEN FOR USER*/
export const validateFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return Responses.failResponse(res, 'CSV file is required!', 400);
    }

    const allowedMimes = ['text/csv', 'application/vnd.ms-excel'];
    const isCSV = allowedMimes.includes(req.file.mimetype) || req.file.originalname.toLowerCase().endsWith('.csv');

    if (!isCSV) {
      return rejectUploadedFile(req, res, 'Only CSV files are allowed!', 400);
    }

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB

    if (req.file.size > MAX_SIZE) {
      return rejectUploadedFile(req, res, `CSV file size is more than ${MAX_SIZE / 1024 / 1024} MB!`, 400);
    }

    next();
  } catch (error) {
    if (req.file?.path) {
      await safeUnlinkTempFile(req.file.path);
    }
    return Responses.errorResponse(res, error.message);
  }
};
