import express from 'express';
import multer from 'multer';
import { importMarketPlaceCategoriesFromCsv } from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile } from '#middleware/index.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' }); // saves CSV temporarily

// POST /api/import-csv
router.post(
  '/importMarketPlaceCategories/:marketPlaceId',
  checkLanguage,
  upload.single('file'),
  validateFile,
  authMiddleware,
  importMarketPlaceCategoriesFromCsv
);

export default router;
