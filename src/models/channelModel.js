import mongoose from 'mongoose';
//   {
//     "LanguageCode": "en",
//     "CountryCode": "IN",
//     "GlobalChannelId": 1733,
//     "GlobalChannelName": "Amazon.in (v3)",
//     "ChannelId": 2,
//     "IsEnabled": false,
//     "ChannelName": "Amazon.in (v3)",
//     "Reference": null
//   }
const channelSchema = new mongoose.Schema(
  {
    languageCode: {
      type: String,
    },
    countryCode: {
      type: String,
      index: true,
    },
    globalChannelId: {
      type: Number,
      required: true,
    },
    globalChannelName: {
      type: String,
      default: null,
      required: true,
      index: true,
    },
    channelId: {
      type: Number,
      required: true,
    },
    isEnabled: {
      type: Boolean,
      required: true,
      index: true,
      default: true,
    },

    channelName: {
      type: String,
      default: null,
      required: true,
      index: true,
    },
    reference: {
      type: String,
    },

    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);
const Channel = mongoose.model('channels', channelSchema);
export default Channel;
