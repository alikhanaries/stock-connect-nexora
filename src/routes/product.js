import { getMyProducts, pushToStore } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productRouter = express.Router();

productRouter.use(authMiddleware);

productRouter.get('/my-products', getMyProducts);
productRouter.post('/push-to-store', pushToStore);

export default productRouter;
