import express from 'express';
import { mapCategory } from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import { mapCategoryValidator } from '#validations/category.js';
const router = express.Router();

router.put('/mapCategory', mapCategoryValidator, checkLanguage, authMiddleware, mapCategory);

export default router;
