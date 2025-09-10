import { config } from '../config/config.js';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import User from '../models/User.js';
import UserChannels from '../models/UserChannels.js';
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
const getAllChannels = async (query) => {
  try {
    const { page = 1, size = 10, search, sortBy = '_id', sortOrder = 'asc', appliedFilters = {} } = query;

    const parsedLimit = Math.min(Math.max(parseInt(size) || 10, 1), 100); // max 100 per page
    const currentPage = Math.max(parseInt(page) || 1, 1);

    // Build Mongo query
    const mongoQuery = { isActive: true };
    if (search) {
      mongoQuery.channelName = { $regex: search, $options: 'i' };
    }

    // Count total channels
    const total = await Channel.countDocuments(mongoQuery);

    // Fetch paginated channels
    const channels = await Channel.find(mongoQuery, { _id: 1, channelName: 1, channelImageUrl: 1 })
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
const saveUserChannels = async (userId, channelIds) => {
  try {
    // Format incoming channelIds into schema shape
    const formattedChannels = channelIds.map((id) => {
      if (!ObjectId.isValid(id)) {
        throw new Error(`Invalid channelId: ${id}`);
      }
      return {
        id: new ObjectId(id),
        status: 'active', // default
      };
    });

    // Update or create UserChannels
    const updatedUserChannels = await UserChannels.findOneAndUpdate(
      { userId: new ObjectId(userId) },
      { $set: { channelIds: formattedChannels } }, // ✅ correct structure
      { new: true, upsert: true }
    );

    // Update user flag
    await User.updateOne({ _id: new ObjectId(userId) }, { $set: { isMarketplaceConnected: true } });
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
    const { page = 1, limit = 10, status = 'active', search, sortBy = 'createdAt', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;
    const parsedLimit = parseInt(limit);
    const currentPage = Math.max(1, Number(page));

    const appliedFilters = {};
    if (query?.status) {
      appliedFilters.status = query?.status;
    }

    const pipeline = [
      { $match: { userId: new ObjectId(userId), isActive: true } },

      { $unwind: '$channelIds' },
      // Fetch only removed channels
      { $match: { 'channelIds.status': status } },

      {
        $lookup: {
          from: 'channels',
          localField: 'channelIds.id',
          foreignField: '_id',
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
          from: 'channelproducts',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$marketPlaceId', '$$channelId'] } } }, { $count: 'count' }],
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

export const updateUserChannelsStatus = async (userId, channelIds, status) => {
  try {
    const objectIds = channelIds.map((id) => new ObjectId(id));

    const result = await UserChannels.updateOne(
      { userId: new ObjectId(userId) },
      { $set: { 'channelIds.$[elem].status': status } },
      {
        arrayFilters: [{ 'elem.id': { $in: objectIds }, 'elem.status': { $ne: status } }],
      }
    );
    return result.modifiedCount || 0;
  } catch (err) {
    console.error('Service error in update user channels status:', err);
    throw new Error(err.message);
  }
};
export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
};
