import mongoose from 'mongoose';

const channelsSchema = new mongoose.Schema(
  {
    languageCode: {
      type: String,
    },
    channelImageUrl: {
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

    sampleTemplate: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);
const Channel = mongoose.model('channels', channelsSchema);
export default Channel;
