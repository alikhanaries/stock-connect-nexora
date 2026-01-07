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
    isFrozen: { type: Boolean, default: false },
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
    primaryImageUrl: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    extraImageUrl1: { type: String },
    extraImageUrl2: { type: String },
    extraImageUrl3: { type: String },
    modelName: {
      type: String,
      trim: true,
      index: true,
    },
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
    ageRangeDescription: {
      type: String,
      trim: true,
      enum: ['Adult', 'Kids', 'Toddler', 'Infant', 'Newborn'],
      default: 'Adult',
    },
    sizeType: {
      type: String,
      enum: ['Age', 'Alpha', 'Numeric', 'Waist'],
      default: 'Alpha',
    },
    productCareInstructions: {
      type: String,
      trim: true,
    },
    countryOfOrigin: {
      type: String,
      trim: true,
    },
    departmentName: {
      type: String,
      trim: true,
    },
    fabricType: {
      type: String,
      trim: true,
    },
    style: {
      type: String,
      trim: true,
    },
    weaveType: {
      type: String,
      trim: true,
    },
    dangerousGoodsRegulations: {
      type: String,
      trim: true,
      default: 'not_applicable',
    },

    skinType: { type: String, trim: true },
    safetyWarning: { type: String, trim: true },
    unitCount: { type: Number },
    unitCountType: { type: String, trim: true },
    targetAudienceKeyword: { type: String, trim: true },
    hairType: { type: String, trim: true },
    ingredientsList: { type: String, trim: true },
    searchTerms: { type: String, trim: true },
    scent: { type: String, trim: true },
    numberOfItems: { type: Number, default: 1 },
    manufacturer: { type: String, trim: true },
    lifestyle: { type: String, trim: true },
    heatSensitive: { type: Boolean, default: false },
    liquidContents: { type: Boolean, default: false },
    itemForm: { type: String, trim: true },
    riseStyle: {
      type: String,
      trim: true,
    },
    intendedUse: {
      type: String,
      trim: true,
    },
    productBenefit: {
      type: String,
      trim: true,
    },
    itemLength: {
      type: String,
      trim: true,
    },
    itemWidth: {
      type: String,
      trim: true,
    },
    itemHeight: {
      type: String,
      trim: true,
    },
    specialFeature: {
      type: String,
      trim: true,
    },
    bulletPoint: {
      type: String,
      trim: true,
    },
    apparelSizeBodyType: {
      type: String,
      trim: true,
      default: 'Regular',
    },
    specialSize: {
      type: String,
      trim: true,
      default: 'Standard',
    },
    material: {
      type: String,
      trim: true,
    },
    closureType: {
      type: String,
      trim: true,
      default: 'Pull On',
    },
    fitType: {
      type: String,
      trim: true,
      default: 'Regular',
    },
    bottomsHeightType: {
      type: String,
      trim: true,
      default: 'Regular',
      enum: ['Regular', 'Short', 'Tall', 'Extra Tall', 'Petite', 'Big & Tall'],
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
