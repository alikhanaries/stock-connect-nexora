import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSellerSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

userSellerSchema.index({ userId: 1, sellerId: 1 }, { unique: true });
const UserSeller = mongoose.model('UserSeller', userSellerSchema);
export default UserSeller;
