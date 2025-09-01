import { getProducts, pushProductToChannelEngine } from '#controllers/ProductController.js';
import { authMiddleware } from '#middleware/index.js';
import express from 'express';

const productsRouter = express.Router();

productsRouter.use(authMiddleware);

productsRouter.get('/', getProducts);
productsRouter.get('/push-to-channelengine', pushProductToChannelEngine);
export default productsRouter;
