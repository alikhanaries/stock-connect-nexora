import mongoose from 'mongoose';

// Define sub-schema for channelIds
const skuListSchema = new mongoose.Schema(
  {
    skuCode: {
      type: String,
      required: true,
      index: true,
    },
    skuId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { _id: false } // disables auto _id for subdocuments
);

// Main schema
const channelProductsSchema = new mongoose.Schema(
  {
    channelId: {
      type: Number,
      required: true,
      index: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    skuList: [skuListSchema],
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

const UserChannelProducts = mongoose.model('UserChannelProducts', channelProductsSchema);
export default UserChannelProducts;
