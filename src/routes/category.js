import express from 'express';
import { getPlatformCategories } from '../controllers/CategoryController.js';
import { checkLanguage } from '#middleware/index.js';
import { getPlatformCategoriesValidator } from '#validations/category.js';

const router = express.Router();

router.get('/getPlatformCategories', getPlatformCategoriesValidator, checkLanguage, getPlatformCategories);

export default router;
