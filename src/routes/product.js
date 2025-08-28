import { getProducts, updateProductStatus } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productsRouter = express.Router();

productsRouter.use(authMiddleware);

productsRouter.get('/', getProducts);
productsRouter.patch('/update-status', updateProductStatus);

export default productsRouter;
