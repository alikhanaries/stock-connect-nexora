import mongoose from 'mongoose';
const SellerOrderSchema = new mongoose.Schema(
  {
    //  identifiers
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    sellerOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },

    //  time (for all graphs & filters)
    orderDate: {
      type: Date,
      required: true,
      index: true,
    },

    // channel (for channel analytics)
    channelId: {
      type: Number,
      required: true,
      index: true,
    },
    channelName: {
      type: String,
      required: true,
      index: true,
    },

    // order status (for order flow)
    status: {
      type: String,
      enum: ['NEW', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED', 'CANCELED'],
      required: true,
      index: true,
    },

    // CORE ANALYTICS FIELDS
    totalAmount: {
      type: Number,
      default: 0, // full order GMV
    },

    deliveredAmount: {
      type: Number,
      default: 0, //  ONLY delivered SKU value (important metric)
    },

    totalQuantity: {
      type: Number,
      default: 0, // total items count
    },
    totalSkus: {
      type: Number,
      default: 0, // total sku count
    },
    //  OPTIONAL BUT POWERFUL (future safe)
    statusBreakdown: {
      confirmed: { type: Number, default: 0 },
      shipped: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      canceled: { type: Number, default: 0 },
      returned: { type: Number, default: 0 },
      shipmentCreated: { type: Number, default: 0 },
    },
    netAmount: {
      type: Number,
      default: 0,
    },

    canceledAmount: {
      type: Number,
      default: 0,
    },
    returnedAmount: {
      type: Number,
      default: 0,
    },
    // PRODUCTS ARRAY (NEW)
    products: [
      {
        productId: {
          type: Number,
          required: true,
          index: true,
        },
        merchantProductNo: {
          type: String,
          index: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        lineTotalInclVat: {
          type: Number,
          default: 0,
        },
        lineVat: {
          type: Number,
          default: 0,
        },
        originalUnitPriceInclVat: {
          type: Number,
          default: 0,
        },
        originalUnitVat: {
          type: Number,
          default: 0,
        },
        vatRate: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  { _id: false },
  { timestamps: true }
);

SellerOrderSchema.index({ sellerId: 1, orderDate: -1 });
SellerOrderSchema.index({ orderDate: -1 });
SellerOrderSchema.index({ status: 1 });
SellerOrderSchema.index({ channelId: 1 });
SellerOrderSchema.index({ sellerId: 1, status: 1 });
SellerOrderSchema.index({ sellerId: 1, channelId: 1 });
const SellerOrder = mongoose.model('sellerorders', SellerOrderSchema);

export default SellerOrder;
