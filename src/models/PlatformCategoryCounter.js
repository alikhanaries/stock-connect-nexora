import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  seq: {
    type: Number,
    default: 99, // first increment will be 100
  },
});
const PlatformCategoryCounter = mongoose.model('PlatformCategoryCounter', CounterSchema);
export default PlatformCategoryCounter;
