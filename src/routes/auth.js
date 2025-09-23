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
import { authMiddleware, authorize } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
const allowedRoles = Object.values(USER_ROLES);

const router = express.Router();

router.post('/login', loginValidator, login);
router.post('/register', registerValidator, authMiddleware, authorize(allowedRoles), register);
router.post('/refresh-token', refreshToken);
router.post('/forget-password', forgetPasswordValidator, forgotPassword);
router.post('/validate-reset-token', resetTokenValidator, validateResetToken);
router.post('/reset-password', resetPasswordValidator, resetPassword);

export default router;
