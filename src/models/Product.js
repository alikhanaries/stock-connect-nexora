import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
    },

    grandParentProductSkuCode: { type: String, trim: true, default: null },
    parentProductSkuCode: { type: String, trim: true, default: null },
    productSkuCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, trim: true },
    description: { type: String },
    descriptionAr: {
      type: String,
      trim: true,
    },
    brand: { type: String, trim: true },
    ean: { type: String, trim: true, unique: false },
    price: { type: Number, required: true },
    noonPrice: { type: Number, required: true },
    namshiPrice: { type: Number, required: true },
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
    isFrozen: { type: Boolean, default: false },
    categoryTrail: { type: String },
    marketPlace: { type: String, trim: true, default: null },
    images: [{ type: String, trim: true }],
    currentStockCount: { type: Number, default: 0 },
    volumetricWeightCm: { type: Number, required: true },
    hsCodeAE: { type: String, required: true },
    hsCodeSA: { type: String, required: true },
    size: { type: String },
    color: { type: String },
    primaryImageUrl: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    extraImageUrl1: { type: String },
    extraImageUrl2: { type: String },
    extraImageUrl3: { type: String },
    productType: {
      type: String,
      enum: ['simple', 'configurable'],
      required: true,
      default: 'simple',
      index: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Unisex'],
      default: 'Unisex',
      trim: true,
    },
    countryOfOrigin: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ['SHOPIFY', 'MANUAL', 'AMAZON', 'NOON', 'TRENDYOL'],
      default: 'MANUAL',
      uppercase: true,
      trim: true,
      index: true,
    },
    updatedAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
    },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

// Indexes for performance
ProductSchema.index({ productSkuCode: 1 }, { unique: true });
ProductSchema.index({ sellerId: 1, productSkuCode: 1 });
ProductSchema.index({ sellerId: 1, ean: 1 });
ProductSchema.index({ sellerId: 1, brand: 1 });
ProductSchema.index({ sellerId: 1, marketPlace: 1 });
ProductSchema.index({
  sellerId: 1,
  name: 'text',
  brand: 'text',
  description: 'text',
});
ProductSchema.index({ sellerId: 1, status: 1, createdAt: 1 });
ProductSchema.index({ sellerId: 1, syncedAt: 1, updatedAt: 1 });
const Product = mongoose.model('Product', ProductSchema);
export default Product;
