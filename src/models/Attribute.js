import mongoose from 'mongoose';

const AttributeSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true },
    value: { type: String, trim: true },
  },
  { _id: false }
);

export default AttributeSchema;
