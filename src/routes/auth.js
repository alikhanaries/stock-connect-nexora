import express from 'express';
import {
  login,
  refreshToken,
  register,
  forgotPassword,
  validateResetToken,
  resetPassword,
} from '#controllers/AuthController.js';
import { authMiddleware, authorize, validateInput } from '#middleware/index.js';
import { loginSchema, registerSchema } from '#validations/auth.js';
import { USER_ROLES } from '#constants/common.js';

const router = express.Router();

router.post('/login', validateInput(loginSchema), login);
router.post('/register', authMiddleware, authorize(USER_ROLES), validateInput(registerSchema), register);
router.post('/refresh-token', refreshToken);
router.post('/forget-password', forgotPassword);
router.post('/validate-reset-token', validateResetToken);
router.post('/reset-password', resetPassword);

export default router;
