import mongoose from 'mongoose';

const CustomerDetailsSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'NOT_APPLICABLE'],
      default: 'NOT_APPLICABLE',
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    languageCode: {
      type: String,
      trim: true,
    },
    companyRegistrationNo: {
      type: String,
      trim: true,
    },
    channelCustomerNo: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

export default CustomerDetailsSchema;
