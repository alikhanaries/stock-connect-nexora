import { getProducts } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productRouter = express.Router();

productRouter.use(authMiddleware);

productRouter.get('/', getProducts);

export default productRouter;
