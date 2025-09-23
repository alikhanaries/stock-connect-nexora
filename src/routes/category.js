import express from 'express';
import { getPlatformCategories } from '../controllers/CategoryController.js';
import { getPlatformCategoriesValidator } from '#validations/category.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
const router = express.Router();

router.get(
  '/getPlatformCategories/:marketPlaceId',
  getPlatformCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getPlatformCategories
);

export default router;
