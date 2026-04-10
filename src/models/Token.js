import mongoose from 'mongoose';

const TokenSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'omniful',
    },
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

TokenSchema.index({ name: 1 }, { unique: true });

const Token = mongoose.model('Token', TokenSchema);
export default Token;
