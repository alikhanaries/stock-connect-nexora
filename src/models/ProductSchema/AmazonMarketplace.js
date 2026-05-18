import mongoose from 'mongoose';

const AmazonMarketplaceSchema = new mongoose.Schema(
  {
    variationThemeName: { type: String, trim: true },
    modelNumber: { type: String, trim: true },
    modelName: { type: String, trim: true },
    style: { type: String, trim: true },
    bulletPoint: { type: String, trim: true },
    footwearSizeSystem: { type: String, trim: true },
    footwearAgeGroup: { type: String, trim: true },
    footwearSizeClass: { type: String, trim: true },
    footwearWidth: { type: String, trim: true },
    footwearSize: { type: String, trim: true },
    soleMaterial: { type: String, trim: true },
    toeStyle: { type: String, trim: true },
    heightMap: { type: String, trim: true },
    heelType: { type: String, trim: true },
    waterResistanceLevel: { type: String, trim: true },
    closure: { type: String, trim: true },
    shaftCircumference: { type: String, trim: true },
    shaftHeight: { type: String, trim: true },
    skipOffer: { type: String, trim: true },
    itemCondition: { type: String, trim: true },
    listPriceCurrency: { type: String, trim: true },
    dangerousGoodsRegulations: { type: String, trim: true },
    outerMaterial: { type: String, trim: true },
  },
  { _id: false }
);

export default AmazonMarketplaceSchema;
