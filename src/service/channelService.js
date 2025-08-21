import { config } from '../config/config.js';
import Channel from '../models/channelModel.js';
const { CHANNEL_ENGINE_URL } = config;

/** FUNC - GET ALL CHANNEL LIST FROM CHANNEL PARTNER AND SAVE */
const getAllChannelsFromChannelPartner = async () => {
  try {
    const response = await fetch(CHANNEL_ENGINE_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.Content?.length) {
      return { success: false, message: 'No data received from channel partner' };
    }

    // Filter & transform
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
      }))
    );

    console.log(`Fetched ${data.Content.length}, filtered ${filteredData.length}, final ${finalData.length}`);

    // Bulk upsert to avoid duplicates
    const bulkOps = finalData.map((doc) => ({
      updateOne: {
        filter: { channelId: doc.channelId }, // unique identifier
        update: { $set: doc },
        upsert: true,
      },
    }));

    const result = await Channel.bulkWrite(bulkOps, { ordered: false });

    return {
      success: true,
      total: finalData.length,
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
    };
  } catch (err) {
    console.error('Error fetching/saving channels:', err.message);
    return { success: false, message: err.message };
  }
};

export default { getAllChannelsFromChannelPartner };

// //import Channel from '../models/channelModel.js';
// import { config } from '../config/config.js';
// import Channel from '../models/channelModel.js';
// const { CHANNEL_ENGINE_URL } = config;

// /** FUNC - GET ALL CHANNEL LIST FROM CHANNEL PARTNER AND SAVE */
//  const getAllChannelsFromChannelPartner = async () => {
//    // FETCH ALL DATA FROM CHANNEL PARTNER API
//    const url = CHANNEL_ENGINE_URL;
//    console.log('url========', url);
//    const response = await fetch(url);
//    console.log('response========', response);
//    if (!response.ok) {
//      return {
//        status: false,
//        message: `HTTP error! Status: ${response.status}`,
//      };
//    }
//    const data = await response.json();
//    console.log('data========', data);
//    if (!data) {
//      //  return res.status(404).json(formatErrorResponse('Error fetching the data', 404));
//      return {
//        status: false,
//        message: `Error fetching the data`,
//      };
//    }
//    // FILTER IT AS CHANNEL SCHEMA
//    const filteredData = data?.Content?.filter((record) => record?.Channels !== null);
//    console.log('filteredData========', filteredData);
//    // SAVE IN CHANNEL SCHEMA

//    // Flatten and transform
//    const finalData = filteredData.flatMap(
//      (channelData) =>
//        channelData?.Channels?.map((item) => ({
//          languageCode: channelData?.LanguageCode,
//          countryCode: channelData?.CountryCode,
//          globalChannelId: channelData?.GlobalChannelId,
//          globalChannelName: channelData?.GlobalChannelName,
//          channelId: item?.ChannelId,
//          isEnabled: item?.IsEnabled,
//          channelName: item?.ChannelName,
//          reference: item?.Reference,
//        })) || [] // in case Channels is null/undefined
//    );

//    console.log('finalData----------', finalData);

//    // Bulk insert into Mongo
//    const saveChannelData = await Channel.insertMany(finalData);
//    console.log('Inserted Docs:', saveChannelData.length);
// return true;
//    //   {
//    //     "LanguageCode": "en",
//    //     "CountryCode": "IN",
//    //     "GlobalChannelId": 1733,
//    //     "GlobalChannelName": "Amazon.in (v3)",
//    //     "ChannelId": 2,
//    //     "IsEnabled": false,
//    //     "ChannelName": "Amazon.in (v3)",
//    //     "Reference": null
//    //   }

//    //  {
//    //             "CountryCode": null,
//    //             "GlobalChannelId": 1892,
//    //             "Channels": [
//    //                 {
//    //                     "ChannelId": 1,
//    //                     "IsEnabled": false,
//    //                     "ChannelName": "Noon V2",
//    //                     "Reference": null
//    //                 }
//    //             ],
//    //             "LanguageCode": null,
//    //             "GlobalChannelName": "Noon V2"
//    //         },

//  };

// // export const getAllChannels = async (req, res) => {
// //   const url = CHANNEL_ENGINE_URL;
// //   try {
// //     const response = await fetch(url);
// //     if (!response.ok) {
// //       throw new Error(`HTTP error! Status: ${response.status}`);
// //     }
// //     const data = await response.json();
// //     if (!data) {
// //       return res.status(404).json(formatErrorResponse('Error fetching the data', 404));
// //     }
// //     let connectedChannels = data?.Content.filter(
// //       (globalChannel) => globalChannel.Channels && globalChannel.Channels.length > 0
// //     );

// //     res.status(200).json({
// //       success: true,
// //       massage: 'Channels Fetched successfully',
// //       content: connectedChannels,
// //     });
// //   } catch (err) {
// //     console.log('error fetching channels', err?.message);
// //     res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch channels!'));
// //   }
// // };

// export default { getAllChannelsFromChannelPartner };
