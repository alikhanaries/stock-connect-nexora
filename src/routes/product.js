import {
  deleteMultipleProducts,
  deleteProduct,
  getProducts,
  getProductById,
  getTopSellingProduct,
  getUserUnassignedProducts,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  getUserChannelProducts,
  addProductsToUserChannel,
  unlinkProductFromChannel,
  exportProducts,
  searchProducts,
} from '#controllers/ProductController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import {
  deleteMultipleProductsValidator,
  importProductsFromCsvFileValidator,
  importProductsFromGoogleSheetValidator,
  unlinkProductFromChannelValidator,
  exportProductsValidator,
} from '#validations/products.js';
import express from 'express';
import {
  addProductsToUserChannelValidator,
  getProductsValidator,
  getUserUnassignedProductsValidator,
  getUserChannelProductsValidator,
  pushProductsToChannelEngineValidator,
  deleteProductValidator,
  getProductByIdValidator,
  getTopSellingProductValidator,
  updateProductStatusValidator,
} from '#validations/products.js';
import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete(
  '/deleteProduct/:id',
  deleteProductValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  deleteProduct
);

productsRouter.get(
  '/getProduct/:id',
  getProductByIdValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getProductById
);

productsRouter.get('/', getProductsValidator, checkLanguage, authMiddleware, verifySellerAccess, getProducts);

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
productsRouter.post(
  '/importProductsFromGoogleSheet',
  importProductsFromGoogleSheetValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  importProductsFromGoogleSheet
);

/* UPLOAD PRODUCTS FROM CSV FILE */
productsRouter.post(
  '/importProductsFromCsvFile',
  importProductsFromCsvFileValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  upload.single('file'),
  validateFile,
  importProductsFromCsvFile
);

productsRouter.get(
  '/push-product-to-channelengine/:channelId',
  pushProductsToChannelEngineValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  pushProductToChannelEngine
);

productsRouter.get('/top-product', getTopSellingProductValidator, checkLanguage, authMiddleware, getTopSellingProduct);

productsRouter.patch(
  '/update-status',
  updateProductStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  updateProductStatus
);

/* DELETE MULTIPLE PRODUCTS BY ID*/
productsRouter.delete(
  '/deleteMultipleProducts',
  deleteMultipleProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  deleteMultipleProducts
);

/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
productsRouter.put(
  '/addProductsToUserChannel/:id',
  addProductsToUserChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  addProductsToUserChannel
);

productsRouter.delete(
  '/unlink-product-from-channel/:channelId',
  unlinkProductFromChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  unlinkProductFromChannel
);

productsRouter.get(
  '/user-channel-products/:channelId',
  getUserChannelProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserChannelProducts
);

productsRouter.get(
  '/get-user-unassigned-products/:channelId',
  getUserUnassignedProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserUnassignedProducts
);

/* EXPORT PRODUCTS TO CSV */
productsRouter.post(
  '/export/:sellerId',
  exportProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  exportProducts
);

productsRouter.post('/searchProducts/:sellerId', checkLanguage, authMiddleware, verifySellerAccess, searchProducts);

export default productsRouter;
