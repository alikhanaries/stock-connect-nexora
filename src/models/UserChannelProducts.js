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
    channelStatus: {
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
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    channelId: {
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
channelProductsSchema.index({ channelId: 1, sellerId: 1 }, { unique: true });

const UserChannelProducts = mongoose.model('UserChannelProducts', channelProductsSchema);
export default UserChannelProducts;
