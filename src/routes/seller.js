import express from 'express';
import {
  softDeleteSellers,
  updateSeller,
  updateSellerStatus,
  createSeller,
  getAllSeller,
  getSellerById,
  savePickupAddress,
  getAyMakanCities,
  getAllPickupAddresses,
  updatePickupAddress,
  deletePickupAddress,
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
  savePickupAddressValidator,
  getAymaknCityValidator,
  getAllPickupAddressesValidator,
  updatePickupAddressValidator,
  deletePickupAddressValidator,
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
seller.get('/', getAllSellerValidator, checkLanguage, authMiddleware, getAllSeller);
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
// GET SELLER PICKUP ADDRESS LIST API

seller.get(
  '/getAllPickupAddresses/:id',
  getAllPickupAddressesValidator,
  checkLanguage,
  authMiddleware,
  getAllPickupAddresses
);

seller.patch(
  '/:id',
  updateSellerValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSeller
);

// Update pickup address
seller.put(
  '/updatePickupAddress/:id',
  updatePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updatePickupAddress
);

// Delete pickup address
seller.delete(
  '/deletePickupAddress/:id',
  deletePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  deletePickupAddress
);

//GET AYMAKN CITY LIST
seller.get(
  '/getAyMakanCities',
  getAymaknCityValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  getAyMakanCities
);

// SAVE SELLER PICKUP ADDRESS API
seller.post(
  '/savePickupAddress',
  savePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  savePickupAddress
);

seller.get('/:id', getSellerByIdValidator, checkLanguage, authMiddleware, getSellerById);

export default seller;
