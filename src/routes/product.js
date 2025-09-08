import {
  getProducts,
  getTopSellingProduct,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  deleteMultipleProducts,
  deleteProduct,
  addProductsToUserChannel,
} from '#controllers/ProductController.js';
import { checkLanguage } from '#middleware/index.js';
import { authMiddleware, validateFile } from '#middleware/index.js';
import express from 'express';
import { addProductsToUserChannelValidator } from '#validations/products.js';
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

productsRouter.patch('/update-status', authMiddleware, updateProductStatus);
/* DELETE MULTIPLE PRODUCTS BY ID*/
productsRouter.delete('/deleteMultipleProducts', authMiddleware, deleteMultipleProducts);
/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
productsRouter.post(
  '/addProductsToUserChannel',
  addProductsToUserChannelValidator,
  checkLanguage,
  addProductsToUserChannel
);

export default productsRouter;
