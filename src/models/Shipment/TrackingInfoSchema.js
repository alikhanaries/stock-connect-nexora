import mongoose from 'mongoose';
const TrackingInfoSchema = new mongoose.Schema(
  {
    statusCode: { type: String, required: true },
    description: { type: String },
    descriptionAr: { type: String, default: null },
    reasonCode: { type: String, default: null },
    reasonEn: { type: String, default: null },
    reasonAr: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

export default TrackingInfoSchema;
