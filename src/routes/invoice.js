import { authMiddleware, checkLanguage } from '#middleware/index.js';
import express from 'express';
import { uploadInvoiceController } from '../controllers/InvoiceController.js';
import { invoiceMerchantIdValidator } from '../validations/invoice.js';

const router = express.Router();

router.get('/', invoiceMerchantIdValidator, checkLanguage, authMiddleware, uploadInvoiceController);

export default router;
