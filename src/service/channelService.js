import { config } from '../config/config.js';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import User from '../models/User.js';
import UserChannels from '../models/UserChannels.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
// Access ObjectId from mongoose
const ObjectId = mongoose.Types.ObjectId;
const { CHANNEL_ENGINE_URL } = config;

/** FUNC - GET ALL CHANNEL LIST FROM CHANNEL PARTNER AND SAVE */
const getAllChannelsFromChannelPartner = async () => {
  try {
    // GET THE LIST FROM CHANELPARTNER API
    const response = await fetch(CHANNEL_ENGINE_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.Content?.length) {
      return { success: false, message: 'No data received from channel partner' };
    }

    // FILTER THE LIST WHICH WE HAVE GOT FROM CHANNEL PARTNER API
    const filteredData = data.Content.filter((record) => record?.Channels?.length);
    const finalData = filteredData.flatMap((channelData) =>
      channelData.Channels.map((item) => ({
        languageCode: channelData.LanguageCode,
        countryCode: channelData.CountryCode,
        globalChannelId: channelData.GlobalChannelId,
        globalChannelName: channelData.GlobalChannelName,
        channelId: item.ChannelId,
        isEnabled: item.IsEnabled,
        channelName: item.ChannelName,
        reference: item.Reference,
        isActive: true,
        channelImageUrl:
          channelData.GlobalChannelId === 1733
            ? 'https://axevhvmfbgbd.compat.objectstorage.me-riyadh-1.oraclecloud.com/stock_connect_assests/images/suppliers/amazion1'
            : channelData.GlobalChannelId === 1892
              ? 'https://axevhvmfbgbd.compat.objectstorage.me-riyadh-1.oraclecloud.com/stock_connect_assests/images/suppliers/noon'
              : null,
      }))
    );

    // BULK INSERT IN DATABASE
    const bulkOps = finalData.map((doc) => ({
      updateOne: {
        filter: { channelId: doc.channelId }, // unique identifier
        update: { $set: doc },
        upsert: true,
      },
    }));

    await Channel.bulkWrite(bulkOps, { ordered: false });

    return {
      success: true,
    };
  } catch (err) {
    console.error('Error :', err.message);
    return { success: false, message: err.message };
  }
};

/** FUNC - GET ALL CHANNEL LIST FROM DATABASE */
const getAllChannels = async (query, userId) => {
  try {
    const { page = 1, size = 10, search, sortBy = '_id', sortOrder = 'asc', appliedFilters = {} } = query;

    const parsedLimit = Math.min(Math.max(parseInt(size) || 10, 1), 100);
    const currentPage = Math.max(parseInt(page) || 1, 1);

    // Build base query
    const mongoQuery = {};
    if (search) {
      mongoQuery.channelName = { $regex: search, $options: 'i' };
    }

    // 🔹 Find channels already linked to this user
    const userChannels = await UserChannels.find({ userId }, { 'channelIds.id': 1 }).lean();

    const excludedChannelIds = userChannels.flatMap((uc) => uc.channelIds.map((c) => c.id));

    if (excludedChannelIds.length > 0) {
      mongoQuery.channelId = { $nin: excludedChannelIds };
    }

    // Count total channels
    const total = await Channel.countDocuments(mongoQuery);

    // Fetch paginated channels
    const channels = await Channel.find(mongoQuery, { _id: 1, channelName: 1, channelImageUrl: 1, channelId: 1 })
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((currentPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .lean();

    return {
      channels,
      pagination: getPagination(total, currentPage, parsedLimit),
      appliedFilters,
    };
  } catch (err) {
    console.error('Error in getAllChannels:', err);
    throw new Error(err.message);
  }
};

/** FUNC - SAVE USER SELECTED CHANNEL DATA */
const saveUserChannels = async (userId, ids) => {
  try {
    // Format incoming channelIds into schema shape
    const formattedChannels = ids.map((id) => {
      if (!ObjectId.isValid(id)) {
        throw new Error(`Invalid ids: ${id}`);
      }
      return {
        id,
        status: 'active',
      };
    });

    // Update or create UserChannels
    const updatedUserChannels = await UserChannels.findOneAndUpdate(
      { userId: new ObjectId(userId) },
      { $addToSet: { channelIds: { $each: formattedChannels } } },
      { new: true, upsert: true }
    );
    // Update user flag if not already true
    await User.updateOne(
      { _id: new ObjectId(userId), isMarketplaceConnected: { $ne: true } },
      { $set: { isMarketplaceConnected: true } }
    );
    return {
      success: true,
      data: updatedUserChannels,
    };
  } catch (err) {
    console.error('Error in saveUserChannels:', err);
    return { success: false, message: err.message };
  }
};

/** FUNC - GET USER CHANNEL LIST */
export const getAllUserChannels = async (userId, query) => {
  try {
    const { page = 1, limit = 10, status, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;
    const parsedLimit = parseInt(limit);
    const currentPage = Math.max(1, Number(page));
    const appliedFilters = {};
    if (query?.status) {
      appliedFilters.status = query?.status;
    }

    const baseMatch = {
      userId: new ObjectId(userId),
      ...(status ? { 'channelIds.status': status } : { 'channelIds.status': { $in: ['active', 'inactive'] } }),
    };
    const pipeline = [
      { $match: baseMatch },
      { $unwind: '$channelIds' },
      {
        $lookup: {
          from: 'channels',
          localField: 'channelIds.id',
          foreignField: 'channelId',
          as: 'channelDetails',
        },
      },
      { $unwind: '$channelDetails' },
      ...(search ? [{ $match: { 'channelDetails.channelName': { $regex: search, $options: 'i' } } }] : []),
      // Orders count
      {
        $lookup: {
          from: 'orders',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$channelId', '$$channelId'] } } }, { $count: 'count' }],
          as: 'ordersInfo',
        },
      },
      // Products count
      {
        $lookup: {
          from: 'userchannelproducts', // :point_left: collection name (check in Mongo, likely lowercased plural)
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$channelId', '$$channelId'] }, isActive: true } },
            { $project: { count: { $size: '$skuList' } } },
          ],
          as: 'productsInfo',
        },
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          channel: {
            _id: '$channelDetails._id',
            channelId: '$channelDetails.channelId',
            channelName: '$channelDetails.channelName',
            channelImageUrl: '$channelDetails.channelImageUrl',
            status: '$channelIds.status',
            createdAt: '$channelIds.createdAt',
            ordersCount: { $ifNull: [{ $arrayElemAt: ['$ordersInfo.count', 0] }, 0] },
            productsCount: { $ifNull: [{ $arrayElemAt: ['$productsInfo.count', 0] }, 0] },
          },
        },
      },
      { $sort: { [`channel.${sortBy}`]: sortOrder === 'asc' ? 1 : -1 } },
    ];
    // First pipeline for paginated data
    const dataPipeline = [...pipeline, { $skip: skip }, { $limit: parsedLimit }];
    // Second pipeline for total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const [channels, totalResult] = await Promise.all([
      UserChannels.aggregate(dataPipeline),
      UserChannels.aggregate(countPipeline),
    ]);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    return {
      success: total === 0 ? false : true,
      channelData: {
        userId,
        total,
        page: parseInt(page),
        limit: parsedLimit,
        content: channels.map((ch) => ch.channel),
      },
      pagination: getPagination(total, currentPage, limit),
      appliedFilters,
    };
  } catch (err) {
    console.error('Error in getAllUserChannels:', err);
    return { success: false, message: err.message };
  }
};

export const updateUserChannelsStatus = async (userId, ids, status) => {
  try {
    const result = await UserChannels.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { 'channelIds.$[elem].status': status } },
      {
        arrayFilters: [{ 'elem.id': { $in: ids }, 'elem.status': { $ne: status } }],
      }
    );
    return result.modifiedCount || 0;
  } catch (err) {
    console.error('Service error in update user channels status:', err);
    throw new Error(err.message);
  }
};

export const removeUserChannels = async (userId, ids) => {
  try {
    // Remove from UserChannels
    const channelResult = await UserChannels.updateMany(
      { userId: new ObjectId(userId) },
      { $pull: { channelIds: { id: { $in: ids } } } }
    );

    // Delete related products
    await UserChannelProducts.deleteMany({
      userId: new ObjectId(userId),
      channelId: { $in: ids },
    });
    return channelResult.modifiedCount || 0;
  } catch (err) {
    console.error('Service error in removeUserChannels:', err);
    throw new Error('Failed to remove user channels. Please try again.');
  }
};

export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
};
