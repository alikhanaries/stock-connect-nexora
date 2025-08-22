import mongoose from 'mongoose';
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);
const Channel = mongoose.model('channels', channelSchema);
export default Channel;
