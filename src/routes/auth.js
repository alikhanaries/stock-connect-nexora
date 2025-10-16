import express from 'express';
import {
  login,
  refreshToken,
  register,
  forgotPassword,
  validateResetToken,
  resetPassword,
} from '#controllers/AuthController.js';
import {
  forgetPasswordValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
  resetTokenValidator,
} from '#validations/auth.js';
import { authMiddleware, authorize, checkLanguage } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
const allowedRoles = Object.values(USER_ROLES);

const router = express.Router();

router.post('/login', loginValidator, checkLanguage, login);
router.post('/register', registerValidator, checkLanguage, authMiddleware, authorize(allowedRoles), register);
router.post('/refresh-token', checkLanguage, refreshToken);
router.post('/forget-password', forgetPasswordValidator, checkLanguage, forgotPassword);
router.post('/validate-reset-token', resetTokenValidator, checkLanguage, validateResetToken);
router.post('/reset-password', resetPasswordValidator, checkLanguage, resetPassword);

export default router;
