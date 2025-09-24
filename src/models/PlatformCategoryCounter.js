import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  marketPlaceId: {
    type: Number,
    required: true,
    index: true,
  },
  seq: {
    type: Number,
    default: 99, // start from 99, so first increment = 100
  },
});
const PlatformCategoryCounter = mongoose.model('PlatformCategoryCounter', CounterSchema);
export default PlatformCategoryCounter;
