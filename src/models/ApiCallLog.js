import mongoose from 'mongoose';
import { apiLogConfig } from '../config/apiLog.js';

const { Schema } = mongoose;

const ApiCallLogSchema = new Schema(
  {
    requestId: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true,
    },
    method: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    route: {
      type: String,
      trim: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    durationMs: {
      type: Number,
      required: true,
      index: true,
    },
    isSlow: {
      type: Boolean,
      default: false,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userEmail: {
      type: String,
      trim: true,
    },
    userRole: {
      type: String,
      trim: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'Seller',
      index: true,
    },
    sellerIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Seller',
      },
    ],
    sellerName: {
      type: String,
      trim: true,
    },
    ip: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
    requestHeaders: {
      type: Schema.Types.Mixed,
    },
    requestQuery: {
      type: Schema.Types.Mixed,
    },
    requestBody: {
      type: Schema.Types.Mixed,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    integration: {
      type: String,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ApiCallLogSchema.index({ createdAt: -1 });
ApiCallLogSchema.index({ sellerId: 1, createdAt: -1 });
ApiCallLogSchema.index({ userId: 1, createdAt: -1 });
ApiCallLogSchema.index({ statusCode: 1, createdAt: -1 });
ApiCallLogSchema.index({ path: 1, method: 1, createdAt: -1 });

if (apiLogConfig.retentionSeconds > 0) {
  ApiCallLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: apiLogConfig.retentionSeconds });
}

const ApiCallLog = mongoose.model('ApiCallLog', ApiCallLogSchema, 'api_call_logs');

export default ApiCallLog;
