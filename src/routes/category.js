import express from 'express';
import multer from 'multer';
import {
  importMarketPlaceCategoriesFromCsv,
  mapCategory,
  getMarketplaceCategories,
  getStockConnectCategories,
  getMarketPlaceCategoryTrails,
} from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import {
  importMarketPlaceCategoriesValidator,
  mapCategoryValidator,
  getMarketplaceCategoriesValidator,
  getStockConnectCategoriesValidator,
  getMarketPlaceCategoryTrailsValidator,
} from '#validations/category.js';
const router = express.Router();
const upload = multer({ dest: 'uploads/' }); // saves CSV temporarily

router.post(
  '/importMarketPlaceCategories/:marketPlaceId',
  importMarketPlaceCategoriesValidator,
  checkLanguage,
  upload.single('file'),
  validateFile,
  authMiddleware,
  importMarketPlaceCategoriesFromCsv
);
router.get(
  '/getMarketPlaceCategoryTrails/:productCategoryTrail/:sellerId',
  getMarketPlaceCategoryTrailsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getMarketPlaceCategoryTrails
);

router.put(
  '/mapCategory/:sellerId',
  mapCategoryValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  mapCategory
);
router.get(
  '/getStockConnectCategories/:sellerId',
  getStockConnectCategoriesValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getStockConnectCategories
);

router.get(
  '/getMarketplaceCategories/:marketPlaceId',
  getMarketplaceCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getMarketplaceCategories
);

export default router;
