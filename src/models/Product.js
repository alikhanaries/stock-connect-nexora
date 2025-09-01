import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    parentProductId: { type: String, trim: true },
    parentProductSkuCode: { type: String, trim: true },
    productSkuCode: { type: String, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    brand: { type: String, trim: true },
    attributes: { type: String, trim: true },
    ean: { type: String, trim: true, unique: false },
    price: { type: Number, required: true },
    minPrice: { type: Number },
    maxPrice: { type: Number },
    msrp: { type: Number },
    purchasePrice: { type: Number },
    vatRateType: {
      type: String,
      enum: ['STANDARD', 'REDUCED', 'ZERO'],
      default: 'STANDARD',
    },
    status: {
      type: Boolean,
      default: true,
    },
    shippingCost: { type: Number, default: 0 },
    shippingTime: { type: String },
    url: { type: String, trim: true },
    isFrozen: { type: Boolean, default: false },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    categoryTrail: { type: String },
    marketPlace: { type: String, trim: true },
    images: [{ type: String, trim: true }],
    currentStockCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for performance
ProductSchema.index({ ean: 1 });
ProductSchema.index({ parentProductSkuCode: 1 });
ProductSchema.index({ productSkuCode: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ marketPlace: 1 });
ProductSchema.index({ brand: 1, categories: 1 });
ProductSchema.index({ name: 'text', brand: 'text', description: 'text' });

const Product = mongoose.model('Product', ProductSchema);
export default Product;
