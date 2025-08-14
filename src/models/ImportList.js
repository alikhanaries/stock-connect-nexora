import mongoose from 'mongoose';

const ImportListSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ImportList = mongoose.model('ImportList', ImportListSchema);
export default ImportList;
