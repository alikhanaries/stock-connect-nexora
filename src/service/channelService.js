import { config } from '../config/config.js';
import Channel from '../models/channelModel.js';
import messages from '../constants/constantMessages.js';
import { escapeRegex } from '../helpers/commonHelper.js';
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
const getAllChannels = async (bodyData, queryData) => {
  try {
    const { order = -1, limit = 10, page = 1 } = queryData || {};
    const { searchKey = null } = bodyData || {};

    // Base query
    const query = { isActive: true };

    if (searchKey) {
      query.$or = [
        { globalChannelName: { $regex: escapeRegex(searchKey.trim()), $options: 'i' } },
        { channelName: { $regex: escapeRegex(searchKey.trim()), $options: 'i' } },
      ];
    }

    // Pagination
    const parsedLimit = parseInt(limit, 10) || 10;
    const parsedPage = parseInt(page, 10) || 1;
    const skip = (parsedPage - 1) * parsedLimit;

    // Get total count
    const totalCount = await Channel.countDocuments(query);
    // Get data
    const result = await Channel.find(query)
      .sort({ _id: parseInt(order) })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    if (!result.length) {
      return { success: false, message: messages?.channelsNotFound, totalCount: 0 };
    }

    return { success: true, data: result, totalCount };
  } catch (err) {
    console.error('Error in getAllChannels:', err);
    return { success: false, message: err.message };
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels };
