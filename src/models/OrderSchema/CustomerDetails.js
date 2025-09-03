import mongoose from 'mongoose';

const CustomerDetailsSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    Gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'NOT_APPLICABLE'],
      default: 'NOT_APPLICABLE',
    },
    FirstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    LastName: {
      type: String,
      trim: true,
    },
    Phone: {
      type: String,
      trim: true,
    },
    Email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    LanguageCode: {
      type: String,
      trim: true,
    },
    CompanyRegistrationNo: {
      type: String,
      trim: true,
    },
    ChannelCustomerNo: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

export default CustomerDetailsSchema;
