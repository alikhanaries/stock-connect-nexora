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
import {
  authMiddleware,
  authorize,
  checkLanguage,
  forgetPasswordRateLimiter,
  loginRateLimiter,
  refreshTokenRateLimiter,
} from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
const allowedRoles = Object.values(USER_ROLES);

const router = express.Router();

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: User Login
 *     description: Authenticate user and return access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "test@example.com"
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/login', loginRateLimiter, loginValidator, checkLanguage, login);

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: User Registration
 *     security:
 *       - bearerAuth: []
 *     description: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 example: "user"
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid data
 */
router.post('/register', registerValidator, checkLanguage, authMiddleware, authorize(allowedRoles), register);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Refresh JWT Token
 *     description: Refresh the access token using refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "abc123refresh"
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', refreshTokenRateLimiter, checkLanguage, refreshToken);

/**
 * @openapi
 * /auth/forget-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Forget Password
 *     description: |
 *       Request a password reset link. If the email is registered, a reset link is sent.
 *       The response is always the same whether or not the email exists (no enumeration).
 *       The reset token is never returned in the response body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: If the email is registered, a reset link has been dispatched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Email verification successful"
 *       400:
 *         description: Invalid email format
 *       429:
 *         description: Too many requests
 */
router.post('/forget-password', forgetPasswordRateLimiter, forgetPasswordValidator, checkLanguage, forgotPassword);

/**
 * @openapi
 * /auth/validate-reset-token:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Validate Reset Token
 *     description: Check whether a password reset token from the email link is still valid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken]
 *             properties:
 *               resetToken:
 *                 type: string
 *                 example: "a1b2c3d4e5f6..."
 *     responses:
 *       200:
 *         description: Token validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Missing or invalid request body
 */
router.post('/validate-reset-token', resetTokenValidator, checkLanguage, validateResetToken);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Reset Password
 *     description: |
 *       Set a new password using the reset token from the email link.
 *       All existing access and refresh tokens are invalidated after a successful reset.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken:
 *                 type: string
 *                 example: "a1b2c3d4e5f6..."
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token, or invalid password
 */
router.post('/reset-password', resetPasswordValidator, checkLanguage, resetPassword);

export default router;
