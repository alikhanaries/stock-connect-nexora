import express from 'express';
import multer from 'multer';
import {
  importMarketPlaceCategoriesFromCsv,
  mapCategory,
  getMarketplaceCategories,
} from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile } from '#middleware/index.js';
import {
  importMarketPlaceCategoriesValidator,
  mapCategoryValidator,
  getMarketplaceCategoriesValidator,
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

router.put('/mapCategory', mapCategoryValidator, checkLanguage, authMiddleware, mapCategory);

router.get(
  '/getMarketplaceCategories/:marketPlaceId',
  getMarketplaceCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getMarketplaceCategories
);

export default router;
