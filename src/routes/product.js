import {
  getProducts,
  pushProductToChannelEngine,
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
productsRouter.post('/uploadProductsFromGoogleSheet', uploadProductsFromGoogleSheet);
/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post(
  '/uploadProductsFromCsvFile',
  upload.single('file'),
  validateFile,
  uploadProductsFromCsvFile
);


productsRouter.get('/', authMiddleware,getProducts);
productsRouter.get('/push-to-channelengine',authMiddleware, pushProductToChannelEngine);

export default productsRouter;
