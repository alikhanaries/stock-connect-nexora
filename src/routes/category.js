import express from 'express';
import multer from 'multer';
import { importPlatformCategoriesFromCsv } from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile } from '#middleware/index.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' }); // saves CSV temporarily

// POST /api/import-csv
router.post(
  '/importPlatformCategories',
  checkLanguage,
  upload.single('file'),
  validateFile,
  authMiddleware,
  importPlatformCategoriesFromCsv
);

export default router;
