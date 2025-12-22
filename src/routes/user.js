import express from 'express';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import {
  getAllUsers,
  getUserById,
  softDeleteUser,
  updateUser,
  updatePassword,
  deleteAllUsers,
  deleteSelectedUsers,
  updateSelectedUserStatus,
} from '#controllers/UserController.js';
import {
  bulkDeleteUsersValidator,
  getAllUsersValidator,
  userIdValidator,
  updatePasswordValidator,
  updateSelectedUserStatusValidator,
  updateUserValidator,
} from '#validations/users.js';
import { sellerMiddleware } from '#middleware/sellerMiddleware.js';

const user = express.Router();

/**
 * @openapi
 * /user/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.get('/me', checkLanguage, authMiddleware, getUserById);

/**
 * @openapi
 * /user:
 *   get:
 *     tags: [Users]
 *     summary: Get all users
 *     description: Fetches a paginated list of users with filtering options.
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - name: size
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - name: role
 *         in: query
 *         schema:
 *           type: string
 *           enum: [admin, master_admin, seller, user]
 *       - name: active
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.get('/', getAllUsersValidator, checkLanguage, authMiddleware, verifySellerAccess, sellerMiddleware, getAllUsers);

/**
 * @openapi
 * /user/update-password:
 *   patch:
 *     tags: [Users]
 *     summary: Update current user's password
 *     description: Allows the current user to change their password
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.patch('/update-password', updatePasswordValidator, checkLanguage, authMiddleware, updatePassword);

/**
 * @openapi
 * /user/all:
 *   delete:
 *     tags: [Users]
 *     summary: Delete all users
 *     description: Deletes all users in the system
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.delete('/all', checkLanguage, authMiddleware, deleteAllUsers);

/**
 * @openapi
 * /user/bulk:
 *   delete:
 *     tags: [Users]
 *     summary: Delete multiple users
 *     description: Deletes selected users by IDs
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.delete('/bulk', bulkDeleteUsersValidator, checkLanguage, authMiddleware, verifySellerAccess, deleteSelectedUsers);

/**
 * @openapi
 * /user/update-status:
 *   patch:
 *     tags: [Users]
 *     summary: Update status for selected users
 *     description: Updates the active/inactive status for multiple users
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, status]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.patch(
  '/update-status',
  updateSelectedUserStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  updateSelectedUserStatus
);

/**
 * @openapi
 * /user/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9a-fA-F]{24}$"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 *
 *   patch:
 *     tags: [Users]
 *     summary: Update user details
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9a-fA-F]{24}$"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdate'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 *
 *   delete:
 *     tags: [Users]
 *     summary: Soft delete a user
 *     parameters:
 *       - name: Accept-Language
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9a-fA-F]{24}$"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         $ref: '#/components/schemas/FailResponse'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
user.patch('/:id', updateUserValidator, checkLanguage, authMiddleware, updateUser);
user.get('/:id', userIdValidator, checkLanguage, authMiddleware, getUserById);
user.delete('/:id', userIdValidator, checkLanguage, authMiddleware, softDeleteUser);

export default user;
