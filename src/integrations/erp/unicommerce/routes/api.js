import express from 'express';
import UniCommerceRouter from './unicommerce.js';
const router = express.Router();

router.use('/', UniCommerceRouter);
export default router;
