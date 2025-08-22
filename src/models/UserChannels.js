import mongoose from 'mongoose';

const userChannelsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // optional: reference to User model
    },

    channelIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Channel', // optional: reference to Channel model
      },
    ],
  },
  { timestamps: true }
);

const UserChannels = mongoose.model('UserChannels', userChannelsSchema);
export default UserChannels;
