import express from 'express';
import { fetchProducts } from '../controllers/ProductController.js';

const ProductsRouter = express.Router();
ProductsRouter.get('/sync', fetchProducts);

export default ProductsRouter;
