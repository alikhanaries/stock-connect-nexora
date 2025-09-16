import express from 'express';
import multer from 'multer';
import { importMarketPlaceCategoriesFromCsv, addCategory } from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile } from '#middleware/index.js';
import { importMarketPlaceCategoriesValidator, addCategoryValidator } from '#validations/category.js';


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



router.put('/addCategory', addCategoryValidator, checkLanguage, authMiddleware, addCategory);

export default router;
