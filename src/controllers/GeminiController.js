import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import { translateProductField as translateProductFieldService } from '#service/translateService.js';
import Product from '#models/Product.js';
import mongoose from 'mongoose';

export const translateProductField = async (req, res) => {
  try {
    const translate = req.body;
    const sellerId = req.sellerId;

    const fields = [...new Set(translate.map((t) => t.field))];

    const exists = await Product.exists({
      sellerId: new mongoose.Types.ObjectId(sellerId),
      $or: fields.map((f) => ({ [f]: { $exists: true, $nin: [null, ''] } })),
    });

    if (!exists) {
      return failResponse(res, req.locale.NO_PRODUCTS_TO_TRANSLATE, 404);
    }

    successResponse(res, req.locale.TRANSLATION_STARTED, 200);

    translateProductFieldService({ translate, sellerId })
      .then((result) => console.log(`Translation complete: ${JSON.stringify(result)}`))
      .catch((error) => errorLog(error));
  } catch (error) {
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};
