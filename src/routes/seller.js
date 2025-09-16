import express from 'express';
import { createSeller, getAllSeller } from '#controllers/SellerController.js';
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import { createSellerValidator, getAllSellerValidator } from '#validations/sellers.js';
const seller = express.Router();

const allowedRoles = [USER_ROLES.BRAND_SUPER_ADMIN, USER_ROLES.PLATFORM_MASTER];

seller.post('/create', authMiddleware, authorize(USER_ROLES.PLATFORM_MASTER), createSellerValidator, createSeller);
seller.get('/', authMiddleware, authorize(allowedRoles), getAllSellerValidator, getAllSeller);

export default seller;
