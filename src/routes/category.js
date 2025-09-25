import express from 'express';
import multer from 'multer';

import {
  importMarketPlaceCategoriesFromCsv,
  mapCategory,
  getMarketPlaceCategoryTrails,
} from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile } from '#middleware/index.js';
import { importMarketPlaceCategoriesValidator, mapCategoryValidator } from '#validations/category.js';
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
router.get('/getMarketPlaceCategoryTrails/:productCategoryTrail', checkLanguage, getMarketPlaceCategoryTrails);

router.put('/mapCategory', mapCategoryValidator, checkLanguage, authMiddleware, mapCategory);

export default router;
