import express from 'express';
import { getStockConnectCategories } from '../controllers/CategoryController.js';
import { getStockConnectCategoriesValidator } from '#validations/category.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
const router = express.Router();

router.get(
  '/getStockConnectCategories',
  getStockConnectCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getStockConnectCategories
);

export default router;
