import {
  getProducts,
  uploadProductsFromGoogleSheet,
  uploadProductsFromCsvFile,
} from '#controllers/ProductController.js';
import { authMiddleware, validateFile } from '#middleware/index.js';
import express from 'express';

import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

productsRouter.get('/', authMiddleware, getProducts);
/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post('/uploadProductsFromGoogleSheet', authMiddleware, uploadProductsFromGoogleSheet);
/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post(
  '/uploadProductsFromCsvFile',
  authMiddleware,
  validateFile,
  upload.single('file'),
  uploadProductsFromCsvFile
);

export default productsRouter;
