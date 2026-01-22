import mongoose from 'mongoose';
const TrackingInfoSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    description: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

export default TrackingInfoSchema;
