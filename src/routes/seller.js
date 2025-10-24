import express from 'express';
import {
  softDeleteSellers,
  updateSeller,
  updateSellerStatus,
  createSeller,
  getAllSeller,
  getSellerById,
} from '#controllers/SellerController.js';
import { authMiddleware, authorize, checkLanguage } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import {
  softDeleteSellerValidator,
  updateSellerStatusValidator,
  updateSellerValidator,
  createSellerValidator,
  getAllSellerValidator,
  getSellerByIdValidator,
} from '#validations/sellers.js';
const seller = express.Router();

seller.post(
  '/create',
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  createSellerValidator,
  checkLanguage,
  createSeller
);
seller.get('/', authMiddleware, getAllSellerValidator, checkLanguage, getAllSeller);
seller.delete(
  '/bulk-delete',
  softDeleteSellerValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  softDeleteSellers
);
seller.patch(
  '/status-update',
  updateSellerStatusValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSellerStatus
);

seller.get('/:id', getSellerByIdValidator, checkLanguage, authMiddleware, getSellerById);
seller.patch(
  '/:id',
  updateSellerValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSeller
);

export default seller;
