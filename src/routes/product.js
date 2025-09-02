import {
  getProducts,
  getTopSellingProduct,
  pushProductToChannelEngine,
  importProductsFromGoogleSheet,
  importProductsFromCsvFile,
  deleteProduct,
} from '#controllers/ProductController.js';
import { authMiddleware, validateFile } from '#middleware/index.js';
import express from 'express';

import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete('/deleteProduct/:prId', deleteProduct);

productsRouter.get('/', authMiddleware, getProducts);

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post('/importProductsFromGoogleSheet', importProductsFromGoogleSheet);
/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post('/importProductsFromCsvFile', upload.single('file'), validateFile, importProductsFromCsvFile);

productsRouter.get('/push-to-channelengine', authMiddleware, pushProductToChannelEngine);
productsRouter.get('/top-product', authMiddleware, getTopSellingProduct);

export default productsRouter;
