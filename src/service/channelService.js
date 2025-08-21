import mongoose from 'mongoose';
import Channel from '../models/channelModel.js';
const { ObjectId } = mongoose.Types;

/** FUNC - GET ALL CHANNEL LIST FROM CHANNEL PARTNER AND SAVE */
export const getAllChannelsFromChannelPartner = async (userId, token) => {



//  {
//             "CountryCode": null,
//             "GlobalChannelId": 1892,
//             "Channels": [
//                 {
//                     "ChannelId": 1,
//                     "IsEnabled": false,
//                     "ChannelName": "Noon V2",
//                     "Reference": null
//                 }
//             ],
//             "LanguageCode": null,
//             "GlobalChannelName": "Noon V2"
//         },


  const userData = await User.findOne(
    { _id: new ObjectId(userId), isActive: true },
    {
      _id: 1,
      email: 1,
      name: 1,
      isActive: 1,
      token: 1,
    }
  );

  if (userData) {
    if (userData?.token !== token) {
      return { invalidToken: true };
    }
    return userData;
  } else {
    return false;
  }
};
