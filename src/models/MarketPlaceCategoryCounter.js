import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  marketplaceId: {
    type: Number,
    required: true,
    index: true,
  },
  seq: {
    type: Number,
    default: 99, // start from 99, so first increment = 100
  },
});
const MarketPlaceCategoryCounter = mongoose.model('MarketPlaceCategoryCounter', CounterSchema);
export default MarketPlaceCategoryCounter;
