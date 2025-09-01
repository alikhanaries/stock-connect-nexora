import { getProducts, deleteProduct } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

productsRouter.get('/', authMiddleware, getProducts);

/* GET USER CHANNEL LIST */
productsRouter.delete('/deleteProduct/:prId', authMiddleware, deleteProduct);

export default productsRouter;
