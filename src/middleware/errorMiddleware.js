import { errorHandler } from '#helpers/ErrorHandler.js';
import { errorLog } from './errorLogMiddleware.js';

export const errorMiddleware = async (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || 'unknown';
  const error = err instanceof Error ? err : new Error(String(err));

  try {
    await errorLog(error, {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
    });
  } catch (logError) {
    console.error(`Failed to write error log [requestId=${requestId}]:`, logError.message);
  }

  errorHandler(error, res);
};
