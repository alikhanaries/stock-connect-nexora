import mongoose from 'mongoose';
import { CE_QUEUE_OPERATIONS, CE_QUEUE_STATUSES } from '#constants/channelEngineQueue.js';

const channelEngineQueueJobSchema = new mongoose.Schema(
  {
    bullJobId: { type: String, index: true },
    operationType: {
      type: String,
      enum: Object.values(CE_QUEUE_OPERATIONS),
      required: true,
      index: true,
    },
    method: { type: String, required: true },
    url: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true, default: null },
    status: {
      type: String,
      enum: CE_QUEUE_STATUSES,
      default: 'queued',
      index: true,
    },
    requestBody: { type: mongoose.Schema.Types.Mixed, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    rawResponse: { type: String, default: null },
    httpStatus: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    errorDetails: { type: mongoose.Schema.Types.Mixed, default: null },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    batchId: { type: String, index: true, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

channelEngineQueueJobSchema.index({ createdAt: -1 });
channelEngineQueueJobSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
channelEngineQueueJobSchema.index({ operationType: 1, status: 1, createdAt: -1 });

const ChannelEngineQueueJob = mongoose.model('ChannelEngineQueueJob', channelEngineQueueJobSchema);
export default ChannelEngineQueueJob;
