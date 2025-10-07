import {
  deleteMultipleProducts,
  deleteProduct,
  getProducts,
  getTopSellingProduct,
  getUserUnassignedProducts,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  getUserChannelProducts,
  addProductsToUserChannel,
  unlinkProductFromChannel,
} from '#controllers/ProductController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import {
  deleteMultipleProductsValidator,
  importProductsFromCsvFileValidator,
  importProductsFromGoogleSheetValidator,
  unlinkProductFromChannelValidator,
} from '#validations/products.js';
import express from 'express';
import {
  addProductsToUserChannelValidator,
  getProductsValidator,
  getUserUnassignedProductsValidator,
  getUserChannelProductsValidator,
  pushProductsToChannelEngineValidator,
  deleteProductValidator,
  getTopSellingProductValidator,
  updateProductStatusValidator,
} from '#validations/products.js';
import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete('/deleteProduct/:id', deleteProductValidator, checkLanguage, authMiddleware, deleteProduct);

productsRouter.get('/', getProductsValidator, checkLanguage, authMiddleware, getProducts);

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

productsRouter.get(
  '/push-product-to-channelengine/:channelId',
  pushProductsToChannelEngineValidator,
  checkLanguage,
  authMiddleware,
  pushProductToChannelEngine
);

productsRouter.get('/top-product', getTopSellingProductValidator, checkLanguage, authMiddleware, getTopSellingProduct);

productsRouter.patch(
  '/update-status',
  updateProductStatusValidator,
  checkLanguage,
  authMiddleware,
  updateProductStatus
);

/* DELETE MULTIPLE PRODUCTS BY ID*/
productsRouter.delete(
  '/deleteMultipleProducts',
  deleteMultipleProductsValidator,
  checkLanguage,
  authMiddleware,
  deleteMultipleProducts
);

/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
productsRouter.put(
  '/addProductsToUserChannel/:id/:sellerId',
  addProductsToUserChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  addProductsToUserChannel
);

productsRouter.delete(
  '/unlink-product-from-channel/:channelId/:sellerId',
  unlinkProductFromChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  unlinkProductFromChannel
);

productsRouter.get(
  '/user-channel-products/:channelId/:sellerId',
  getUserChannelProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserChannelProducts
);

productsRouter.get(
  '/get-user-unassigned-products/:channelId/:sellerId',
  getUserUnassignedProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserUnassignedProducts
);
export default productsRouter;
