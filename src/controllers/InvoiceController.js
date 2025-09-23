// import Responses from '#helpers/response.js';

import { uploadInvoiceService } from '../service/invoiceService.js';
import Responses from '#helpers/response.js';

export const uploadInvoiceController = async (req, res) => {
  try {
    const { merchantNo } = req.query;

    const result = await uploadInvoiceService(merchantNo);

    if (!result.success) {
      return Responses.failResponse(res, req.locale.FAILED_TO_UPLOAD, 404);
    }

    return Responses.successResponse(res, req.locale.IMAGE_UPLOADED_SUCCESSFULLY, 200, {
      url: result.data,
    });
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};
