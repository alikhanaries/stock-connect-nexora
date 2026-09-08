import mongoose from 'mongoose';

/**
 * SyncJob — tracks the lifecycle of a background sync operation.
 * Documents are auto-expired after 24 hours via TTL index.
 */
const SyncJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ['ORDER'],
      default: 'ORDER',
      index: true,
    },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    /** 0–100 progress percentage */
    progress: { type: Number, default: 0, min: 0, max: 100 },
    /** Human-readable label for the current step */
    currentPhase: { type: String, default: 'Starting sync...' },
    /** Total orders fetched from ChannelEngine */
    totalItems: { type: Number, default: 0 },
    /** Orders successfully saved to DB */
    syncedItems: { type: Number, default: 0 },
    errorMessage: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound indexes for efficient polling
SyncJobSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
SyncJobSchema.index({ sellerId: 1, type: 1, createdAt: -1 });

// TTL: auto-delete sync job records after 24 hours
SyncJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const SyncJob = mongoose.model('SyncJob', SyncJobSchema);
export default SyncJob;
