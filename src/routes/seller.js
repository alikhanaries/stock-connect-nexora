import express from 'express';
import { softDeleteSeller, updateSeller, updateSellerStatus } from '#controllers/SellerController.js';
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import { softDeleteSellerValidator, updateSellerStatusValidator, updateSellerValidator } from '#validations/sellers.js';
const seller = express.Router();

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
