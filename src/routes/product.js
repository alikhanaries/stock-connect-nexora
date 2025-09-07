import {
  getProducts,
  getTopSellingProduct,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  deleteMultipleProducts,
  deleteProduct,
} from '#controllers/ProductController.js';
import { authMiddleware, validateFile, checkLanguage } from '#middleware/index.js';
import express from 'express';

import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete('/deleteProduct/:prId', checkLanguage, authMiddleware, deleteProduct);

productsRouter.get('/', authMiddleware, getProducts);

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post('/importProductsFromGoogleSheet', checkLanguage, authMiddleware, importProductsFromGoogleSheet);
/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post(
  '/importProductsFromCsvFile',
  checkLanguage,
  authMiddleware,
  upload.single('file'),
  validateFile,
  importProductsFromCsvFile
);

productsRouter.get('/push-to-channelengine', authMiddleware, pushProductToChannelEngine);
productsRouter.get('/top-product', authMiddleware, getTopSellingProduct);

productsRouter.patch('/update-status', authMiddleware, updateProductStatus);
/* DELETE MULTIPLE PRODUCTS BY ID*/
productsRouter.delete('/deleteMultipleProducts', checkLanguage, authMiddleware, deleteMultipleProducts);

export default productsRouter;
