import mongoose from 'mongoose';

const omnifulInventorySyncLogSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['running', 'success', 'failed'],
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ['cron', 'manual'],
      required: true,
    },
    hubCode: {
      type: String,
      required: true,
    },
    recordsSynced: {
      type: Number,
      default: 0,
    },
    recordsRemoved: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

omnifulInventorySyncLogSchema.index({ createdAt: -1 });

const OmnifulInventorySyncLog = mongoose.model('OmnifulInventorySyncLog', omnifulInventorySyncLogSchema);

export default OmnifulInventorySyncLog;
