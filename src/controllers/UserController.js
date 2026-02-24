import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import userHelper from '#helpers/User.js';
import { errorLog } from '#middleware/index.js';
import Responses from '#helpers/response.js';
import userService from '#service/userService.js';
import { ROLES_BASED_USER_FETCHING, USER_ROLES } from '#constants/common.js';
import UserSeller from '#models/UserSeller.js';
import Seller from '#models/Seller.js';

const userSafeFields = 'firstName lastName email phoneNumber role active createdAt updatedAt';

export const getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user?._id;
    const user = await User.findOne({ _id: id, isDeleted: false }).select(userSafeFields).lean();
    if (!user) {
      return res.status(404).json(formatErrorResponse(req.locale.USER_NOT_FOUND, 404));
    }

    const resSellerId = await userHelper.getConnectedSllerId(user._id);

    if (resSellerId && resSellerId.length === 0) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }
    user.sellerIds = resSellerId;

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

    const { firstName, lastName, email, phoneNumber, active, role, password, sellerIds } = req.body;
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

    if (sellerIds) {
      if (role !== USER_ROLES.MASTER_ADMIN && (!Array.isArray(sellerIds) || sellerIds.length === 0)) {
        return Responses.failResponse(res, 'Atleast one seller id is required for this user role.', 400);
      }
      if (role !== USER_ROLES.MASTER_ADMIN) {
        for (const sellerId of sellerIds) {
          const seller = await userHelper.validateSellerAccessForCreator(
            creatorId,
            sellerId,
            creatorRole,
            updatedUser.role
          );
          if (seller && !seller.success) {
            if (!seller.notBaseSeller) {
              return Responses.failResponse(res, req.locale.CAN_NOT_ASSIGN_BASE_SELLER, 403);
            }
            const message =
              seller.role === USER_ROLES.MASTER_ADMIN ? req.locale.SELLER_DOES_NOT_EXISTS : req.locale.NOT_HAVE_ACCESS;
            return Responses.failResponse(res, message, 403);
          }
        }
      }

      const sellerUpdataion = await userHelper.sellerConnectionUpdate(updatedUser._id, sellerIds);

      if (!sellerUpdataion) {
        return Responses.failResponse(res, req.locale.FAILED_SELLER_CONNECTION, 400);
      }

      userResponseObject.sellerIds = sellerUpdataion;
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
    const baseSellerId = req.baseSeller;
    const sellerConnectionWithUsers = await userHelper.getUserConnectedToThisSellers(seller, user.role, baseSellerId);

    if (sellerConnectionWithUsers.length === 0) {
      return Response.failResponse(res, 'The seller you have provided does not have any user connected', 400);
    }

    const { role, active, search, page = 1, size = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const pageNum = parseInt(page);
    const limit = parseInt(size);

    const skip = (pageNum - 1) * limit;

    const filter = { isDeleted: false };
    filter._id = { $in: sellerConnectionWithUsers };

    if (role) {
      filter.role = role.toLowerCase();
    }
    if (active) {
      if (active === 'true' || active === 'false') {
        filter.active = active === 'true';
      }
    }
    if (search) {
      const words = search.trim().split(/\s+/);

      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      filter.$or = words.flatMap((word) => {
        const regex = new RegExp(escapeRegex(word), 'i');

        return [{ firstName: { $regex: regex } }, { lastName: { $regex: regex } }, { email: { $regex: regex } }];
      });
    }

    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortDirection };

    if (role) {
      const requestedRole = role.toLowerCase();
      filter.role = requestedRole;
    } else if (ROLES_BASED_USER_FETCHING[user.role]) {
      filter.role = { $in: ROLES_BASED_USER_FETCHING[user.role] };
    }

    const aggregationPipeline = [
      { $match: filter },
      { $sort: sort },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: UserSeller.collection.name,
                let: { userId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$userId', '$$userId'] },
                          {
                            $or: [{ $eq: ['$sellerId', seller._id] }, { $eq: ['$sellerId', baseSellerId] }],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'sellerConnection',
              },
            },
            { $unwind: { path: '$sellerConnection', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: Seller.collection.name,
                localField: 'sellerConnection.sellerId',
                foreignField: '_id',
                as: 'sellerDetails',
              },
            },
            { $unwind: { path: '$sellerDetails', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                email: 1,
                role: 1,
                active: 1,
                createdAt: 1,
                updatedAt: 1,
                lastLogin: 1,
                sellerId: '$sellerConnection.sellerId',
                sellerName: '$sellerDetails.name',
              },
            },
          ],
          metadata: [{ $count: 'total' }],
        },
      },
    ];
    const results = await User.aggregate(aggregationPipeline);

    const users = results[0].data;
    const total = results[0].metadata[0] ? results[0].metadata[0].total : 0;

    const pagination = getPagination(total, pageNum, limit);
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
    const sellerId = req.sellerId;
    const deletedUser = await userService.deleteUserId(id, sellerId);

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
    const sellerId = req.sellerId;
    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.PROVIDE_ARRAY_OF_USER_IDS, 400);
    }
    const result = await userService.deleteSelectedUsers(ids, req.locale, sellerId);

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
    const sellerId = req.sellerId;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.PROVIDE_ARRAY_OF_USER_IDS, 400);
    }
    if (typeof active !== 'boolean') {
      return Responses.failResponse(res, req.locale.STATUS_MUST_BE_BOOLEAN, 400);
    }
    const result = await userService.updateSelectedUserStatus(ids, active, sellerId, req.locale);

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
