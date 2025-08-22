import { config } from '../config/config.js';
import mongoose from 'mongoose';
import Channel from '../models/Channel.js';
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
    const result = await Channel.find({ isActive: true }).lean();

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
const saveUserChannelData = async (userId, channelIds) => {
  try {
    // Validate input
    if (!userId || !Array.isArray(channelIds)) {
      return { success: false, message: 'Invalid input data' };
    }

    // Either update existing doc or create new one
    const updatedUserChannels = await UserChannels.findOneAndUpdate(
      { userId: new ObjectId(userId) },
      { $set: { channelIds: channelIds } },
      { new: true, upsert: true } // upsert = create if not exists
    );

    return {
      success: true,
      message: 'Channels saved successfully',
      data: updatedUserChannels,
    };
  } catch (err) {
    console.error('Error in saveUserChannelData:', err);
    return { success: false, message: err.message };
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels, saveUserChannelData };
