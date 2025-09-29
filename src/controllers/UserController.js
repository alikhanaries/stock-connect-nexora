import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import userHelper from '#helpers/User.js';
import { errorLog } from '#middleware/index.js';
import Responses from '#helpers/response.js';
import userService from '#service/userService.js';
import { ROLES_BASED_USER_FETCHING, SELLER_TYPE, USER_ROLES } from '#constants/common.js';

const userSafeFields = 'firstName lastName email phoneNumber role active createdAt updatedAt';

export const getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user?._id;
    const user = await User.findOne({ _id: id, isDeleted: false }).select(userSafeFields).lean();
    if (!user) {
      return res.status(404).json(formatErrorResponse(req.locale.USER_NOT_FOUND, 404));
    }
    const sellerId = await userHelper.getConnectedSllerId(user._id);
    if (!sellerId) {
      return Responses.failResponse(res, req.locale.UNABLE_FETCH_SELLER, 400);
    }
    user.sellerId = sellerId;
    res.status(200).json(formatSuccessResponse(user, req.locale.USER_FETCHED_SUCCESSFULLY));
  } catch (err) {
    errorLog(err);
    res.status(400).json(formatErrorResponse(err?.message || req.locale.FAILED_TO_FETCH_USER_DATA));
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const creatorRole = req.user.role;
    const creatorId = req.user._id;

    const { firstName, lastName, email, phoneNumber, active, role, password, sellerId } = req.body;
    const payload = { firstName, lastName, email, phoneNumber, active, role };

    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return Responses.failResponse(res, req.locale.PASSWORD_LENGTH, 400);
      }
      payload.password = password;
    }

    const updatedUser = await User.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true }).select(
      userSafeFields
    );

    if (!updatedUser) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }

    const userResponseObject = updatedUser.toObject();

    if (sellerId) {
      const seller = await userHelper.validateSellerAccessForCreator(creatorId, sellerId, creatorRole);
      if (seller && !seller.success) {
        if (!seller.notBaseSeller) {
          return Responses.failResponse(res, req.locale.CAN_NOT_ASSIGN_BASE_SELLER, 403);
        }
        const message =
          seller.role === USER_ROLES.MASTER_ADMIN ? req.locale.SELLER_DOES_NOT_EXISTS : req.locale.NOT_HAVE_ACCESS;
        return Responses.failResponse(res, message, 403);
      }

      const sellerUpdataion = await userHelper.sellerConnectionUpdate(updatedUser._id, sellerId);

      if (!sellerUpdataion) {
        return Responses.failResponse(res, req.locale.FAILED_SELLER_CONNECTION, 400);
      }

      userResponseObject.sellerId = sellerUpdataion.sellerId;
    } else {
      const sellerId = await userHelper.getConnectedSllerId(updatedUser._id);
      if (!sellerId) {
        return Responses.failResponse(res, req.locale.UNABLE_FETCH_SELLER, 400);
      }
      userResponseObject.sellerId = sellerId;
    }
    return Responses.successResponse(res, req.locale.USER_UPDATED_SUCCESSFULLY, 200, userResponseObject);
  } catch (error) {
    errorLog(error);
    console.error(error);
    return Responses.errorResponse(res, error.message);
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const user = req.user;
    const seller = req.seller;

    const sellerConnectionWithUsers = await userHelper.getUserConnectedToThisSellers(seller);

    const { role, active, search, page, size = 10 } = req.query;

    const pageNum = parseInt(page);
    const limit = parseInt(size);

    const skip = (pageNum - 1) * limit;

    const filter = { isDeleted: false };

    if (SELLER_TYPE.NORMAL === sellerConnectionWithUsers.type) {
      filter._id = { $in: sellerConnectionWithUsers.userIds };
    }

    if (ROLES_BASED_USER_FETCHING[user.role]) {
      filter.role = { $in: ROLES_BASED_USER_FETCHING[user.role] };
    }
    if (role) {
      filter.role = role.toLowerCase();
    }
    if (active) {
      if (active === 'true' || active === 'false') {
        filter.active = active === 'true';
      }
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [{ firstName: searchRegex }, { lastName: searchRegex }];
    }
    const [totalElements, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).skip(skip).limit(size).select(userSafeFields).lean(),
    ]);
    const pagination = getPagination(totalElements, pageNum, limit);
    const response = {
      content: users,
      appliedFilters: {
        ...(active && { active: active === 'true' }),
        ...(role && { role: role }),
      },
      ...pagination,
      success: true,
      status: 200,
    };
    res.status(200).json(formatSuccessResponse(response, req.locale.USER_FETCHED_SUCCESSFULLY));
  } catch (err) {
    errorLog(err);
    res.status(500).json(formatErrorResponse(err?.message || req.locale.FAILED_TO_FETCH_USER_DATA));
  }
};

export const updatePassword = async (req, res) => {
  console.log('updatePassword called');
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?._id;

    if (!oldPassword || !newPassword) {
      return Responses.failResponse(res, req.locale.OLD_AND_NEW_PASSWORDS_REQUIRED, 400);
    }
    if (oldPassword === newPassword) {
      return Responses.failResponse(res, req.locale.NEW_PASSWORD_MUST_BE_DIFFERENT, 400);
    }

    const user = await User.findOne({ _id: userId, isDeleted: false }).select('+password');

    if (!user) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return Responses.failResponse(res, req.locale.INVALID_OLD_PASSWORD, 400);
    }
    user.password = newPassword;
    await user.save();

    return Responses.successResponse(res, req.locale.PASSWORD_UPDATED_SUCCESSFULLY, 200);
  } catch (error) {
    console.error('userUpdatePassword Error', error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const softDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUser = await userService.deleteUserId(id);

    if (!deletedUser) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.USER_DELETED_SUCCESSFULLY, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error);
  }
};

export const deleteAllUsers = async (req, res) => {
  try {
    const result = await userService.deleteAllUsers();
    if (!result.success) {
      return Responses.failResponse(res, req.locale.FAILED_TO_DELETE_USERS, 404);
    }
    return Responses.successResponse(res, req.locale.ALL_USERS_DELETED_SUCCESSFULLY, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const deleteSelectedUsers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.PROVIDE_ARRAY_OF_USER_IDS, 400);
    }
    const result = await userService.deleteSelectedUsers(ids);

    if (result.success === false) {
      return Responses.failResponse(res, result.message, 400);
    }

    return Responses.successResponse(res, `Successfully deleted ${result.modifiedCount} users.`, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const updateSelectedUserStatus = async (req, res) => {
  try {
    const { ids, active } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.PROVIDE_ARRAY_OF_USER_IDS, 400);
    }
    if (typeof active !== 'boolean') {
      return Responses.failResponse(res, req.locale.STATUS_MUST_BE_BOOLEAN, 400);
    }
    const result = await userService.updateSelectedUserStatus(ids, active);

    if (result.success === false) {
      return Responses.failResponse(res, result.message, 400);
    }

    const statusMessage = active ? req.locale.USERS_ACTIVATED : req.locale.USERS_INACTIVATED;

    return Responses.successResponse(res, `${result.modifiedCount} ${statusMessage} successfully.`, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
