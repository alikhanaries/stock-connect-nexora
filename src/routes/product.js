import { getProducts, pushProductToChannelEngine, deleteProduct } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/* DELETE PRODUCT BY ID*/
productsRouter.delete('/deleteProduct/:prId', deleteProduct);

productsRouter.get('/', authMiddleware, getProducts);

productsRouter.get('/push-to-channelengine', authMiddleware, pushProductToChannelEngine);
export default productsRouter;
