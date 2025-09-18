import MarketplaceCategory from '../models/MarketplaceCategory.js';
import CategoryMapping from '../models/CategoryMapping.js';

export const getMarketplaceCategoriesService = async (marketplaceId) => {
  try {
    const id = Number(marketplaceId);

    // 1️⃣ Fetch all marketplace categories flat
    const categories = await MarketplaceCategory.find(
      { marketplaceId: id },
      {
        _id: 1,
        categoryName: 1,
        parent: 1,
        categoryTrail: 1,
        categorySlug: 1,
        marketplaceCategoryId: 1,
      }
    ).lean();

    // 2️⃣ Fetch mappings and populate PlatformCategory
    const mappings = await CategoryMapping.find({ marketplaceId: String(id) })
      .populate('platformCategoryIdRef', {
        _id: 1,
        categoryName: 1,
        categorySlug: 1,
        platformCategoryTrail: 1,
        platformCategoryId: 1,
      })
      .lean();

    // 3️⃣ Build a lookup { marketplaceCategoryId -> platformCategoryData }
    const mappingMap = {};
    mappings.forEach((map) => {
      const key = String(map.marketplaceCategoryId);
      if (map.platformCategoryIdRef) {
        mappingMap[key] = map.platformCategoryIdRef; // 👈 store as object, not array
      }
    });

    // 4️⃣ Build category map for tree construction
    const categoryMap = {};
    categories.forEach((cat) => {
      categoryMap[cat.categorySlug] = {
        ...cat,
        children: [],
        platformCategoryData: mappingMap[String(cat.marketplaceCategoryId)] || null, // 👈 single object or null
      };
    });

    // 5️⃣ Build the tree
    const tree = [];
    categories.forEach((cat) => {
      if (cat.parent && categoryMap[cat.parent]) {
        categoryMap[cat.parent].children.push(categoryMap[cat.categorySlug]);
      } else {
        tree.push(categoryMap[cat.categorySlug]); // root
      }
    });

    return tree;
  } catch (err) {
    console.error('Error building category tree with platform data:', err);
    throw err;
  }
};
