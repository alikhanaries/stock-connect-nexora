import express from 'express';
import { getMarketplaceCategories } from '../controllers/CategoryController.js';
import { checkLanguage } from '#middleware/index.js';
import { getMarketplaceCategoriesValidator } from '#validations/category.js';
import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get(
  '/getMarketplaceCategories/:marketPlaceId',
  getMarketplaceCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getMarketplaceCategories
);

export default router;
