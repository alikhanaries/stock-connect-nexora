import {
  getProducts,
  getTopSellingProduct,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  deleteMultipleProducts,
  deleteProduct,
  getUserChannelProducts,
} from '#controllers/ProductController.js';
import { authMiddleware, validateFile, checkLanguage } from '#middleware/index.js';
import {
  deleteMultipleProductsValidator,
  importProductsFromCsvFileValidator,
  importProductsFromGoogleSheetValidator,
} from '#validations/products.js';
import express from 'express';

import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete('/deleteProduct/:id', checkLanguage, authMiddleware, deleteProduct);

productsRouter.get('/', authMiddleware, getProducts);

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post(
  '/importProductsFromGoogleSheet',
  importProductsFromGoogleSheetValidator,
  checkLanguage,
  authMiddleware,
  importProductsFromGoogleSheet
);

/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post(
  '/importProductsFromCsvFile',
  importProductsFromCsvFileValidator,
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
productsRouter.delete(
  '/deleteMultipleProducts',
  deleteMultipleProductsValidator,
  checkLanguage,
  authMiddleware,
  deleteMultipleProducts
);

productsRouter.get('/user-channel-products/:channelId', authMiddleware, getUserChannelProducts);
export default productsRouter;
