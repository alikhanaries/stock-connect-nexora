import mongoose from 'mongoose';

const AttributeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    value: { type: String, trim: true },
  },
  { _id: false }
);

const SupplierPlatformSchema = new mongoose.Schema(
  {
    supplier_id: { type: Number },
    supplier_name: { type: String, trim: true },
    slug: { type: String, trim: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    sku: { type: String, unique: true, required: true, trim: true },
    supplier_platform: SupplierPlatformSchema,
    supplier_product_id: { type: String, trim: true },
    active: { type: Boolean },
    average_rating: Number,
    eanCode: { type: String, trim: true },
    bar_code: String,
    brand: { type: String, trim: true },
    color: { type: String, trim: true },
    description: String,
    glance: String,
    handle: { type: String, trim: true },
    has_variants: Boolean,
    highlights: String,
    is_manufactured: Boolean,
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    product_type: { type: String, trim: true },
    sale_price: Number,
    set_product_as_new_end_date: Date,
    set_product_as_new_start_date: Date,
    size: String,
    slug: { type: String, unique: true, trim: true },
    specification: String,
    status: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    attributes: [AttributeSchema],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    product_images: [{ type: String, trim: true }],
    weight: Number,
    parent_line_item_id: { type: String, default: null },
    parent_slug: { type: String, trim: true },
    parent_sku: { type: String, trim: true },
    seo_id: String,
    purchase_cost: Number,
    product_sequence_number: { type: Number },
    stock_qty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ supplier_product_id: 1 });
ProductSchema.index({ eanCode: 1 });
ProductSchema.index({ parent_sku: 1 });
ProductSchema.index({ product_sequence_number: 1 });
ProductSchema.index({ active: 1, price: 1 });

const Product = mongoose.model('Product', ProductSchema);

export default Product;
