import { getPagination } from '#helpers/PaginationHandler.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import mongoose from 'mongoose';
import { config } from '../config/config.js';
import Channel from '../models/Channel.js';
import User from '../models/User.js';
import UserChannels from '../models/UserChannels.js';
import UserSeller from '../models/UserSeller.js';
import { CHANNEL_IMAGE_MAP } from '#constants/common.js';
import Product from '#models/Product.js';
import { buildExtraDataPayload, syncProductExtraDataToMarketplace } from './channel/ceService.js';
// Access ObjectId from mongoose
const ObjectId = mongoose.Types.ObjectId;
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
/** FUNC - GET ALL CHANNEL LIST FROM CHANNEL PARTNER AND SAVE */
const getAllChannelsFromChannelPartner = async () => {
  try {
    // GET THE LIST FROM CHANELPARTNER API
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}channels?apiKey=${CHANNEL_ENGINE_API_KEY}`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.Content?.length) {
      return { success: false, message: 'No data received from channel partner' };
    }

    // FILTER THE LIST WHICH WE HAVE GOT FROM CHANNEL PARTNER API
    const finalData = data.Content.flatMap((channelData) => {
      if (!channelData?.Channels?.length) {
        return [];
      }

      const enabledChannels = channelData.Channels.filter((item) => item.IsEnabled === true);

      return enabledChannels.map((item) => ({
        languageCode: channelData.LanguageCode,
        countryCode: channelData.CountryCode,
        globalChannelId: channelData.GlobalChannelId,
        globalChannelName: channelData.GlobalChannelName,
        channelId: item.ChannelId,
        isEnabled: item.IsEnabled,
        channelName: item.ChannelName,
        reference: item.Reference,
        isActive: true,
        channelImageUrl: CHANNEL_IMAGE_MAP[channelData.GlobalChannelId] || null,
      }));
    });

    if (!finalData.length) {
      return { success: true, message: 'No active channels found to update.' };
    }

    // BULK INSERT IN DATABASE
    const bulkOps = finalData.map((doc) => ({
      updateOne: {
        filter: { channelId: doc.channelId },
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

const updateSampleTemplate = async (channelId, sampleTemplate) => {
  try {
    const numericChannelId = Number(channelId);
    if (Number.isNaN(numericChannelId)) {
      throw new Error('Invalid channelId');
    }

    const updated = await Channel.findOneAndUpdate(
      { channelId: numericChannelId },
      { $set: { sampleTemplate } },
      { new: true }
    );

    return updated?.channelName || null;
  } catch (err) {
    console.error('Error in updateSampleTemplate:', err);
    throw new Error(err.message);
  }
};

/** FUNC - GET ALL CHANNEL LIST FROM DATABASE */
const getAllChannels = async (query, sellerId) => {
  try {
    const { page = 1, size = 10, search, sortBy = '_id', sortOrder = 'asc', appliedFilters = {} } = query;

    const parsedLimit = Math.min(Math.max(parseInt(size) || 10, 1), 100);
    const currentPage = Math.max(parseInt(page) || 1, 1);

    // Build base query
    const mongoQuery = {};
    if (search) {
      mongoQuery.channelName = { $regex: search, $options: 'i' };
    }

    //  Find channels already linked to this user
    const userChannels = await UserChannels.find({ sellerId }, { 'channelIds.id': 1 }).lean();
    if (userChannels?.length) {
      const excludedChannelIds = userChannels.flatMap((uc) => uc.channelIds.map((c) => c.id));

      if (excludedChannelIds.length) {
        mongoQuery.channelId = { $nin: excludedChannelIds };
      }
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
const saveUserChannels = async (sellerId, channelIds) => {
  try {
    // Format incoming channelIds into schema shape
    const formattedChannels = channelIds.map((id) => {
      if (!ObjectId.isValid(id)) {
        throw new Error(`Invalid channelIds: ${id}`);
      }
      return {
        id,
        status: 'active',
      };
    });

    // Update or create UserChannels
    const updatedUserChannels = await UserChannels.findOneAndUpdate(
      { sellerId: new ObjectId(sellerId) },
      { $addToSet: { channelIds: { $each: formattedChannels } } },
      { new: true, upsert: true }
    );
    // Update user flag if not already true
    await User.updateOne(
      {
        _id: await UserSeller.findOne({ sellerId: new mongoose.Types.ObjectId(sellerId) }).then((r) => r?.userId),
        isMarketplaceConnected: { $ne: true },
      },
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
export const getAllUserChannels = async (sellerId, query) => {
  try {
    // before listing (adds missing channels, ignores already-assigned ones)
    await autoAssignAllChannelsToSeller(sellerId);

    const { page = 1, limit = 10, status, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;
    const parsedLimit = parseInt(limit);
    const currentPage = Math.max(1, Number(page));
    const appliedFilters = {};
    if (query?.status) {
      appliedFilters.status = query?.status;
    }

    const baseMatch = {
      sellerId: new ObjectId(sellerId),
      ...(status ? { 'channelIds.status': status } : { 'channelIds.status': { $in: ['active', 'inactive'] } }),
    };

    const pipeline = [
      // Unwind first so match works on each channelIds entry
      { $unwind: '$channelIds' },

      // Now apply the baseMatch (status filtering happens correctly)
      { $match: baseMatch },

      {
        $lookup: {
          from: 'channels',
          localField: 'channelIds.id',
          foreignField: 'channelId',
          as: 'channelDetails',
        },
      },
      { $unwind: '$channelDetails' },

      ...(search
        ? [
            {
              $match: {
                'channelDetails.channelName': {
                  $regex: search,
                  $options: 'i',
                },
              },
            },
          ]
        : []),
      // Orders count
      {
        $lookup: {
          from: 'orders',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$channelId', '$$channelId'] }, { $eq: ['$sellerId', new ObjectId(sellerId)] }],
                },
              },
            },
            { $count: 'count' },
          ],
          as: 'ordersInfo',
        },
      },
      // Products count
      {
        $lookup: {
          from: 'userchannelproducts',
          let: { channelId: '$channelDetails.channelId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$channelId', '$$channelId'] }, { $eq: ['$sellerId', new ObjectId(sellerId)] }],
                },
              },
            },
            { $unwind: '$skuList' },
            // Check if this SKU actually exists in products
            {
              $lookup: {
                from: 'products',
                let: { sku: '$skuList.skuCode' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [{ $eq: ['$productSkuCode', '$$sku'] }, { $ne: ['$status', 'removed'] }],
                      },
                    },
                  },
                  { $project: { _id: 1 } },
                ],
                as: 'matchedProduct',
              },
            },
            { $match: { matchedProduct: { $ne: [] } } },
            { $count: 'count' },
          ],
          as: 'productsInfo',
        },
      },
      {
        $project: {
          _id: 0,
          channel: {
            _id: '$channelDetails._id',
            channelId: '$channelDetails.channelId',
            channelName: '$channelDetails.channelName',
            channelImageUrl: '$channelDetails.channelImageUrl',
            status: '$channelIds.status',
            createdAt: '$channelIds.createdAt',
            ordersCount: {
              $ifNull: [{ $arrayElemAt: ['$ordersInfo.count', 0] }, 0],
            },
            productsCount: {
              $ifNull: [{ $arrayElemAt: ['$productsInfo.count', 0] }, 0],
            },
            sampleTemplate: '$channelDetails.sampleTemplate',
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

export const updateUserChannelsStatus = async (sellerId, ids, status) => {
  try {
    const result = await UserChannels.updateOne(
      { sellerId: new ObjectId(sellerId) },
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

export const removeUserChannels = async (sellerId, ids) => {
  try {
    // Collect SKUs BEFORE deletion
    const userChannelProducts = await UserChannelProducts.find(
      {
        sellerId: new ObjectId(sellerId),
        channelId: { $in: ids },
      },
      { skuList: 1 }
    ).lean();

    const skuCodes = userChannelProducts.length
      ? [...new Set(userChannelProducts.flatMap((doc) => doc.skuList.map((s) => s.skuCode)))]
      : [];

    if (skuCodes.length) {
      // Get channel names
      const channels = await Channel.find({ channelId: { $in: ids } }, { channelName: 1 }).lean();

      const removedChannelNames = channels.map((c) => c.channelName);

      // Update Product marketPlace
      const products = await Product.find(
        {
          sellerId: new ObjectId(sellerId),
          productSkuCode: { $in: skuCodes },
        },
        { productSkuCode: 1, marketPlace: 1 }
      ).lean();

      const bulkOps = products.map((p) => {
        const updatedMarketplaces = p.marketPlace
          ?.split(',')
          .map((s) => s.trim())
          .filter((mp) => !removedChannelNames.includes(mp));

        return {
          updateOne: {
            filter: {
              sellerId: new ObjectId(sellerId),
              productSkuCode: p.productSkuCode,
            },
            update: {
              $set: {
                marketPlace: updatedMarketplaces?.length ? updatedMarketplaces.join(', ') : null,
                updatedAt: new Date(),
              },
            },
          },
        };
      });

      if (bulkOps.length) {
        await Product.bulkWrite(bulkOps);
      }

      // Reload updated products
      const updatedProducts = await Product.find(
        {
          sellerId: new ObjectId(sellerId),
          productSkuCode: { $in: skuCodes },
        },
        { productSkuCode: 1, marketPlace: 1, _id: 0 }
      ).lean();
      // Build payload using existing helper
      const payload = buildExtraDataPayload(updatedProducts);

      if (payload.length) {
        await syncProductExtraDataToMarketplace(payload);
      }
    }

    // delete mappings
    const channelResult = await UserChannels.updateMany(
      { sellerId: new ObjectId(sellerId) },
      { $pull: { channelIds: { id: { $in: ids } } } }
    );

    // Delete related products
    await UserChannelProducts.deleteMany({
      sellerId: new ObjectId(sellerId),
      channelId: { $in: ids },
    });
    return channelResult.modifiedCount || 0;
  } catch (err) {
    console.error('Service error in removeUserChannels:', err);
    throw new Error('Failed to remove user channels. Please try again.');
  }
};

/** FUNC - AUTO ASSIGN ALL AVAILABLE CHANNELS TO A SELLER */
export const autoAssignAllChannelsToSeller = async (sellerId) => {
  try {
    const channels = await Channel.find({}, { channelId: 1 }).lean();

    if (!channels.length) {
      return { success: false, message: 'No active channels found' };
    }

    // Avoid duplicates by checking already-assigned channel ids
    const existingDoc = await UserChannels.findOne({ sellerId: new ObjectId(sellerId) }, { 'channelIds.id': 1 }).lean();

    const existingIds = new Set(existingDoc?.channelIds?.map((c) => c.id) || []);

    const newChannels = channels
      .filter((ch) => !existingIds.has(ch.channelId))
      .map((ch) => ({ id: ch.channelId, status: 'active' }));

    if (!newChannels.length) {
      return { success: true, message: 'All channels already assigned' };
    }

    const userChannels = await UserChannels.findOneAndUpdate(
      { sellerId: new ObjectId(sellerId) },
      { $push: { channelIds: { $each: newChannels } } },
      { new: true, upsert: true }
    );

    return {
      success: true,
      data: userChannels,
    };
  } catch (err) {
    console.error('Error in autoAssignAllChannelsToSeller:', err);
    return { success: false, message: err.message };
  }
};

export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
  updateSampleTemplate,
  autoAssignAllChannelsToSeller,
};
