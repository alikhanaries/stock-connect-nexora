import express from 'express';
import { softDeleteSeller, updateSeller, updateSellerStatus } from '#controllers/SellerController.js';
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import { softDeleteSellerValidator, UpdateSellerStatusValidator, updateSellerValidator } from '#validations/sellers.js';
const seller = express.Router();

seller.patch(
  '/status-update',
  authMiddleware,
  authorize(USER_ROLES.PLATFORM_MASTER),
  UpdateSellerStatusValidator,
  updateSellerStatus
);
seller.patch('/:id', authMiddleware, authorize(USER_ROLES.PLATFORM_MASTER), updateSellerValidator, updateSeller);
seller.delete(
  '/:id',
  authMiddleware,
  authorize(USER_ROLES.PLATFORM_MASTER),
  softDeleteSellerValidator,
  softDeleteSeller
);

export default seller;
