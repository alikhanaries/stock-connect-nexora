import { getProducts, getTopSellingProduct } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productsRouter = express.Router();

productsRouter.use(authMiddleware);

productsRouter.get('/', getProducts);
productsRouter.get('/top-product', getTopSellingProduct);

export default productsRouter;
