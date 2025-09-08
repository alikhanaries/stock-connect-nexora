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
      type: Number,
      required: true,
      index: true,
    },
  },
  { _id: false } // 👈 disables auto _id for subdocuments
);

// Main schema
const channelProductsSchema = new mongoose.Schema(
  {
    marketPlaceId: {
      type: Number,
      required: true,
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

const ChannelProducts = mongoose.model('ChannelProducts', channelProductsSchema);
export default ChannelProducts;
