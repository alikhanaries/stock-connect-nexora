import mongoose from 'mongoose';

const MarketplaceSchema = new mongoose.Schema(
  {
    marketPlaceId: {
      type: Number, // "amazon" // it was string but i changed it to number
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String, // "Amazon"
      required: true,
    },
  },
  { timestamps: true }
);

const Marketplace = mongoose.model('Marketplace', MarketplaceSchema);
export default Marketplace;
