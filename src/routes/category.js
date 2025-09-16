import express from 'express';
import { addCategory } from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import { addCategoryValidator } from '#validations/category.js';
const router = express.Router();

router.put('/addCategory', addCategoryValidator, checkLanguage, authMiddleware, addCategory);

export default router;
