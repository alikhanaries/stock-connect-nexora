import express from 'express';
import { softDeleteSeller, updateSeller, updateSellerStatus, createSeller, getAllSeller } from '#controllers/SellerController.js';
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import { softDeleteSellerValidator, updateSellerStatusValidator, updateSellerValidator,createSellerValidator, getAllSellerValidator } from '#validations/sellers.js';
const seller = express.Router();

const allowedRoles = [USER_ROLES.BRAND_SUPER_ADMIN, USER_ROLES.PLATFORM_MASTER];

seller.post('/create', authMiddleware, authorize(USER_ROLES.PLATFORM_MASTER), createSellerValidator, createSeller);
seller.get('/', authMiddleware, authorize(allowedRoles), getAllSellerValidator, getAllSeller);
seller.patch(
  '/status-update',
  updateSellerStatusValidator,
  authMiddleware,
  authorize(USER_ROLES.PLATFORM_MASTER),
  updateSellerStatus
);
seller.patch('/:id', authMiddleware, authorize(USER_ROLES.PLATFORM_MASTER), updateSellerValidator, updateSeller);
seller.delete(
  '/:id',
  softDeleteSellerValidator,
  authMiddleware,
  authorize(USER_ROLES.PLATFORM_MASTER),
  softDeleteSeller
);


export default seller;
