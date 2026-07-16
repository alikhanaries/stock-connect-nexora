import mongoose from 'mongoose';
import UserChannelProducts from '../models/UserChannelProducts.js';
import Product from '../models/Product.js';
import { escapeCsv } from '../helpers/export.js';
import { buildFilter } from '../util/buildFilter.js';
import { buildCondition } from '../helpers/productFilters.js';

const ALLOWED_SORT_FIELDS = ['_id', 'name', 'price', 'createdAt', 'status'];
export const exportUserChannelProductsToCSV = async (filters, sellerId, channelId, query, res) => {
  try {
    const { sortBy = 'name', sortOrder = 'asc' } = query;

    const finalFilter = buildFilter({
      rawFilters: filters,
      sellerId,
      buildCondition,
    });

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'name';

    const pipeline = [
      {
        $match: {
          sellerId: new mongoose.Types.ObjectId(sellerId),
          channelId: Number(channelId),
        },
      },
      { $unwind: '$skuList' },
      {
        $lookup: {
          from: 'products',
          localField: 'skuList.skuCode',
          foreignField: 'productSkuCode',
          as: 'productDetails',
        },
      },
      { $unwind: '$productDetails' },
      { $match: { 'productDetails.status': { $ne: 'removed' } } },
      { $sort: { [`productDetails.${safeSortBy}`]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 } },
      { $replaceRoot: { newRoot: '$productDetails' } },
      { $match: finalFilter },
    ];

    const cursor = UserChannelProducts.aggregate(pipeline, { allowDiskUse: true }).cursor();

    for await (const product of cursor) {
      const row = [
        product.grandParentProductSkuCode || '',
        product.parentProductSkuCode || '',
        product.productSkuCode || '',
        product.brand || '',
        product.categoryTrail || '',
        product.color || '',
        product.currentStockCount || 0,
        product.description || '',
        product.descriptionAr || '',
        product.ean || '',
        product.extraImageUrl1 || '',
        product.extraImageUrl2 || '',
        product.extraImageUrl3 || '',
        product.gender || '',
        product.hsCodeSA || '',
        product.hsCodeAE || '',
        product.imageUrl || '',
        product.maxPrice || 0,
        product.minPrice || 0,
        product.msrp || 0,
        product.name || '',
        product.nameAr || '',
        product.price || 0,
        product.primaryImageUrl || '',
        product.purchasePrice || 0,
        product.shippingCost || 0,
        product.shippingTime || '',
        product.size || '',
        product.vatRateType || '',
        product.volumetricWeightCm || 0,
        product.noonPrice || 0,
        product.namshiPrice || 0,
        product.amazonPrice || 0,
        // Amazon marketplace listing attributes
        product.amazon?.variationThemeName || '',
        product.amazon?.modelNumber || '',
        product.amazon?.modelName || '',
        product.amazon?.style || '',
        product.amazon?.bulletPoint || '',
        product.amazon?.footwearSizeSystem || '',
        product.amazon?.footwearAgeGroup || '',
        product.amazon?.footwearSizeClass || '',
        product.amazon?.footwearWidth || '',
        product.amazon?.footwearSize || '',
        product.amazon?.soleMaterial || '',
        product.amazon?.toeStyle || '',
        product.amazon?.heightMap || '',
        product.amazon?.heelType || '',
        product.amazon?.waterResistanceLevel || '',
        product.amazon?.closure || '',
        product.amazon?.shaftCircumference || '',
        product.amazon?.shaftHeight || '',
        product.amazon?.skipOffer || '',
        product.amazon?.itemCondition || '',
        product.amazon?.listPriceCurrency || '',
        product.amazon?.dangerousGoodsRegulations || '',
        product.amazon?.outerMaterial || '',
        product.amazon?.departmentName || '',
        product.amazon?.sizeSystem || '',
        product.amazon?.sizeClass || '',
        product.amazon?.bodyType || '',
        product.amazon?.heightType || '',
        product.amazon?.fabricType || '',
        product.amazon?.specialSize || '',
        product.amazon?.weaveType || '',
        product.amazon?.careInstructions || '',
        product.amazon?.shippingTemplateSA || '',
        product.amazon?.fitType || '',
        product.amazon?.riseStyle || '',
        product.amazon?.closureType || '',
        product.amazon?.occasion || '',
        product.amazon?.subtype || '',
      ];

      if (!res.write(escapeCsv(row) + '\n')) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (error) {
    console.error('Error in exportUserChannelProductsToCSV:', error);
    throw error;
  }
};

export const exportUserUnassignedProductsToCSV = async (sellerId, channelId, query, res) => {
  try {
    const { sortBy = 'name', sortOrder = 'asc' } = query;

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'name';

    const assignedSku = await UserChannelProducts.findOne(
      {
        sellerId: new mongoose.Types.ObjectId(sellerId),
        channelId: Number(channelId),
        isActive: true,
      },
      { 'skuList.skuCode': 1 }
    ).lean();
    const assignedSkuCodes = assignedSku?.skuList?.map((s) => s.skuCode) || [];

    // const filter = {
    //   status: { $nin: ['removed', 'inactive'] },
    //   sellerId: new mongoose.Types.ObjectId(sellerId),
    // };

    // Filter for all products (exclude removed only)
    const filter = {
      status: { $ne: 'removed' },
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    if (assignedSkuCodes.length > 0) {
      filter.productSkuCode = { $nin: assignedSkuCodes };
    }

    const sort = { [safeSortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const cursor = Product.find(filter).sort(sort).lean().cursor();

    for await (const product of cursor) {
      const row = [
        product.grandParentProductSkuCode || '',
        product.parentProductSkuCode || '',
        product.productSkuCode || '',
        product.brand || '',
        product.categoryTrail || '',
        product.color || '',
        product.currentStockCount || 0,
        product.description || '',
        product.descriptionAr || '',
        product.ean || '',
        product.extraImageUrl1 || '',
        product.extraImageUrl2 || '',
        product.extraImageUrl3 || '',
        product.gender || '',
        product.hsCodeSA || '',
        product.hsCodeAE || '',
        product.imageUrl || '',
        product.maxPrice || 0,
        product.minPrice || 0,
        product.msrp || 0,
        product.name || '',
        product.nameAr || '',
        product.price || 0,
        product.primaryImageUrl || '',
        product.purchasePrice || 0,
        product.shippingCost || 0,
        product.shippingTime || '',
        product.size || '',
        product.vatRateType || '',
        product.volumetricWeightCm || 0,
        product.noonPrice || 0,
        product.namshiPrice || 0,
        product.amazonPrice || 0,
        // Amazon marketplace listing attributes
        product.amazon?.variationThemeName || '',
        product.amazon?.modelNumber || '',
        product.amazon?.modelName || '',
        product.amazon?.style || '',
        product.amazon?.bulletPoint || '',
        product.amazon?.footwearSizeSystem || '',
        product.amazon?.footwearAgeGroup || '',
        product.amazon?.footwearSizeClass || '',
        product.amazon?.footwearWidth || '',
        product.amazon?.footwearSize || '',
        product.amazon?.soleMaterial || '',
        product.amazon?.toeStyle || '',
        product.amazon?.heightMap || '',
        product.amazon?.heelType || '',
        product.amazon?.waterResistanceLevel || '',
        product.amazon?.closure || '',
        product.amazon?.shaftCircumference || '',
        product.amazon?.shaftHeight || '',
        product.amazon?.skipOffer || '',
        product.amazon?.itemCondition || '',
        product.amazon?.listPriceCurrency || '',
        product.amazon?.dangerousGoodsRegulations || '',
        product.amazon?.outerMaterial || '',
        product.amazon?.departmentName || '',
        product.amazon?.sizeSystem || '',
        product.amazon?.sizeClass || '',
        product.amazon?.bodyType || '',
        product.amazon?.heightType || '',
        product.amazon?.fabricType || '',
        product.amazon?.specialSize || '',
        product.amazon?.weaveType || '',
        product.amazon?.careInstructions || '',
        product.amazon?.shippingTemplateSA || '',
        product.amazon?.fitType || '',
        product.amazon?.riseStyle || '',
        product.amazon?.closureType || '',
        product.amazon?.occasion || '',
        product.amazon?.subtype || '',
      ];

      if (!res.write(escapeCsv(row) + '\n')) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (error) {
    console.error('Error in exportUserUnassignedProductsToCSV:', error);
    throw error;
  }
};
