import {
  getProducts,
  importProductsFromGoogleSheet,
  importProductsFromCsvFile,
  pushProductToChannelEngine,
} from '#controllers/ProductController.js';
import { authMiddleware, validateFile } from '#middleware/index.js';
import express from 'express';

import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

productsRouter.get('/', authMiddleware, getProducts);
/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post('/importProductsFromGoogleSheet', importProductsFromGoogleSheet);
/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post('/importProductsFromCsvFile', upload.single('file'), validateFile, importProductsFromCsvFile);

productsRouter.get('/push-to-channelengine', pushProductToChannelEngine);
export default productsRouter;
