import { config } from '../config/config.js';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
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
const getAllChannels = async () => {
  try {
    // Get data
    const result = await Channel.find({ isActive: true }, { _id: 1, channelName: 1, channelImageUrl: 1 }).lean();
    if (!result.length) {
      return false;
    }
    return result;
  } catch (err) {
    console.error('Error in getAllChannels:', err);
    return { success: false, message: err.message };
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
export const getAllUserChannelsOld = async (userId) => {
  try {
    const objectId = new mongoose.Types.ObjectId(userId);

    const result = await UserChannels.aggregate([
      { $match: { userId: objectId, isActive: true } },

      // Expand channelIds array
      { $unwind: '$channelIds' },

      // Lookup channel details to get channelId
      {
        $lookup: {
          from: 'channels',
          localField: 'channelIds.id', // _id of channel
          foreignField: '_id',
          as: 'channelDetails',
        },
      },
      { $unwind: '$channelDetails' },

      // Lookup orders using channelId from Channels collection
      {
        $lookup: {
          from: 'orders',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$channelId', '$$channelId'] } } }, { $count: 'ordersCount' }],
          as: 'ordersInfo',
        },
      },
      // Lookup products for this channel (marketplace = channelName)
      {
        $lookup: {
          from: 'channelproducts',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$marketPlaceId', '$$channelId'] } } }, { $count: 'productsCount' }],

          as: 'productsInfo',
        },
      },
      // Project required fields
      {
        $project: {
          _id: 0,
          userId: 1,
          channel: {
            _id: '$channelDetails._id',
            channelName: '$channelDetails.channelName',
            channelImageUrl: '$channelDetails.channelImageUrl',
            status: '$channelIds.status',
            createdAt: '$channelIds.createdAt',
            channelId: '$channelDetails.channelId',
            ordersCount: { $ifNull: [{ $arrayElemAt: ['$ordersInfo.ordersCount', 0] }, 0] },
            productsCount: { $ifNull: [{ $arrayElemAt: ['$productsInfo.productsCount', 0] }, 0] },
          },
        },
      },

      // Group channels per user
      {
        $group: {
          _id: '$userId',
          channelDetails: { $push: '$channel' },
        },
      },

      // Final shape
      {
        $project: {
          _id: 0,
          userId: '$_id',
          channelDetails: 1,
        },
      },
    ]);

    if (result.length == 0) {
      return {
        success: false,
      };
    }

    return {
      success: true,
      channelData: result[0],
    };
  } catch (err) {
    console.error('Error in getAllUserChannels:', err);
    return { success: false, message: err.message };
  }
};

/** FUNC - GET USER CHANNEL LIST */
export const getAllUserChannels = async (userId, { page = 1, limit = 10, search = '' }) => {
  try {
    const objectId = new mongoose.Types.ObjectId(userId);
    const skip = (page - 1) * limit;
    const parsedLimit = parseInt(limit);

    const pipeline = [
      { $match: { userId: objectId, isActive: true } },

      // Expand channelIds
      { $unwind: '$channelIds' },

      // Join channels collection
      {
        $lookup: {
          from: 'channels',
          localField: 'channelIds.id',
          foreignField: '_id',
          as: 'channelDetails',
        },
      },
      { $unwind: '$channelDetails' },

      // Apply search filter if provided
      ...(search ? [{ $match: { 'channelDetails.channelName': { $regex: search, $options: 'i' } } }] : []),

      // Lookup orders count
      {
        $lookup: {
          from: 'orders',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$channelId', '$$channelId'] } } }, { $count: 'count' }],
          as: 'ordersInfo',
        },
      },

      // Lookup products count
      {
        $lookup: {
          from: 'channelproducts',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [{ $match: { $expr: { $eq: ['$marketPlaceId', '$$channelId'] } } }, { $count: 'count' }],
          as: 'productsInfo',
        },
      },

      // Flatten fields
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

    if (total === 0) {
      return { success: false, message: 'No channels found' };
    }

    return {
      success: true,
      channelData: {
        userId,
        total,
        page: parseInt(page),
        limit: parsedLimit,
        contents: channels.map((ch) => ch.channel),
      },
    };
  } catch (err) {
    console.error('Error in getAllUserChannels:', err);
    return { success: false, message: err.message };
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels, saveUserChannels, getAllUserChannels };
