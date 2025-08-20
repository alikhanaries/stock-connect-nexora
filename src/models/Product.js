import mongoose from 'mongoose';

const AttributeSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true },
    value: { type: String, trim: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    parentProductId: { type: String },
    parentProductSkuCode: { type: String, trim: true },
    productSkuCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    brand: { type: String, trim: true },
    attributes: [AttributeSchema],
    ean: { type: Number, trim: true, unique: true },
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
    shippingCost: { type: Number, default: 0 },
    shippingTime: { type: String },
    url: { type: String, trim: true },
    isFrozen: { type: Boolean, default: false },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    categoryTrail: { type: String },
    marketPlace: { type: String },
    images: [{ type: String, trim: true }],
    currentStockCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for performance
ProductSchema.index({ ean: 1 });
ProductSchema.index({ productEanCode: 1 });
ProductSchema.index({ parentProductSkuCode: 1 });
ProductSchema.index({ brand: 1 });
ProductSchema.index({ name: 'text', brand: 'text', description: 'text' });

const Product = mongoose.model('Product', ProductSchema);
export default Product;
