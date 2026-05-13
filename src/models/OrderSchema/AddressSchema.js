import mongoose from 'mongoose';

const AddressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    line3: { type: String, trim: true },
    gender: {
      type: String,
      trim: true,
    },
    companyName: { type: String, trim: true },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    streetName: {
      type: String,
      required: [true, 'Street name is required'],
      trim: true,
    },
    houseNr: { type: String, trim: true },
    houseNrAddition: { type: String, trim: true },
    zipCode: {
      type: String,
      required: [true, 'Zip code is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    region: { type: String, trim: true },
    countryIso: {
      type: String,
      required: [true, 'Country ISO code is required'],
      trim: true,
    },
  },
  { _id: false }
);

export default AddressSchema;
