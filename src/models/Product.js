import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },
    longDescriptionAr: {
      type: String,
      trim: true,
    },
    parentProductId: { type: String, trim: true },
    parentProductSkuCode: { type: String, trim: true },
    productSkuCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    titleAr: { type: String, trim: true },
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
      type: String,
      enum: ['active', 'inactive', 'removed'],
      default: 'active',
    },
    shippingCost: { type: Number, default: 0 },
    shippingTime: { type: String },
    url: { type: String, trim: true },
    isFrozen: { type: Boolean, default: false },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    categoryTrail: { type: String },
    categoryTrailAmazon: { type: String, default: null },
    categoryTrailNoon: { type: String, default: null },
    categoryTrailTrendyol: { type: String, default: null },
    marketPlace: { type: String, trim: true },
    images: [{ type: String, trim: true }],
    currentStockCount: { type: Number, default: 0 },
    volumetricWeightCm: { type: Number, required: true },
    hsCodeAE: { type: String, required: true },
    hsCodeSA: { type: String, required: true },
    size: { type: String },
    color: { type: String },
    extraImageUrl1: { type: String },
    extraImageUrl2: { type: String },
    extraImageUrl3: { type: String },
  },
  { timestamps: true }
);

// Indexes for performance
ProductSchema.index({ productSkuCode: 1 }, { unique: true });
ProductSchema.index({ sellerId: 1, productSkuCode: 1 });
ProductSchema.index({ sellerId: 1, ean: 1 });
ProductSchema.index({ sellerId: 1, parentProductSkuCode: 1 });
ProductSchema.index({ sellerId: 1, brand: 1 });
ProductSchema.index({ sellerId: 1, categories: 1 });
ProductSchema.index({ sellerId: 1, marketPlace: 1 });
ProductSchema.index({ sellerId: 1, brand: 1, categories: 1 });
ProductSchema.index({
  sellerId: 1,
  name: 'text',
  brand: 'text',
  description: 'text',
});

const Product = mongoose.model('Product', ProductSchema);
export default Product;
