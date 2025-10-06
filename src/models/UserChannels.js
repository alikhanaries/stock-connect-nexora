import mongoose from 'mongoose';

// Define sub-schema for channelIds
const channelSubSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      index: true,
      ref: 'Channel',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'removed'],
      default: 'active',
      required: true,
      index: true,
    },
  },
  { _id: false, timestamps: true } // 👈 disables auto _id for subdocuments
);

// Main schema
const userChannelsSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },

    channelIds: [channelSubSchema], // 👈 use sub-schema here

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

const UserChannels = mongoose.model('UserChannels', userChannelsSchema);
export default UserChannels;
