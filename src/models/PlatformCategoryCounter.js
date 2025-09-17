import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  seq: {
    type: Number,
    default: 99, // start from 99, so first increment = 100
  },
});
const PlatFormCategoryCounter = mongoose.model('PlatFormCategoryCounter', CounterSchema);
export default PlatFormCategoryCounter;
