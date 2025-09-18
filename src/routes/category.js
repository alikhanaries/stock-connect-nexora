import express from 'express';
import { getMarketplaceCategories } from '../controllers/CategoryController.js';
import { checkLanguage } from '#middleware/index.js';

const router = express.Router();

router.get('/getMarketplaceCategories/:marketPlaceId', checkLanguage, getMarketplaceCategories);

export default router;
