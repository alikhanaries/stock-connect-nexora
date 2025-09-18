import express from 'express';
import { getPlatformCategories } from '../controllers/CategoryController.js';
import { checkLanguage } from '#middleware/index.js';

const router = express.Router();

router.get('/getPlatformCategories', checkLanguage, getPlatformCategories);

export default router;
