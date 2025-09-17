import express from 'express';
import {
  softDeleteSeller,
  updateSeller,
  updateSellerStatus,
  createSeller,
  getAllSeller,
} from '#controllers/SellerController.js';
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import {
  softDeleteSellerValidator,
  updateSellerStatusValidator,
  updateSellerValidator,
  createSellerValidator,
  getAllSellerValidator,
} from '#validations/sellers.js';
const seller = express.Router();

const allowedRoles = [USER_ROLES.SUPER_ADMIN, USER_ROLES.MASTER_ADMIN];

seller.post('/create', authMiddleware, authorize(USER_ROLES.MASTER_ADMIN), createSellerValidator, createSeller);
seller.get('/', authMiddleware, authorize(allowedRoles), getAllSellerValidator, getAllSeller);
seller.patch(
  '/status-update',
  updateSellerStatusValidator,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSellerStatus
);
seller.patch('/:id', authMiddleware, authorize(USER_ROLES.MASTER_ADMIN), updateSellerValidator, updateSeller);
seller.delete('/:id', softDeleteSellerValidator, authMiddleware, authorize(USER_ROLES.MASTER_ADMIN), softDeleteSeller);

export default seller;
