import MarketplaceCategory from '../models/MarketplaceCategory.js';
import CategoryMapping from '../models/CategoryMapping.js';

export const getMarketplaceCategoriesService = async (marketplaceId, searchTerm = '') => {
  try {
    const id = Number(marketplaceId);

    // 1️⃣ Fetch all marketplace categories
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
        mappingMap[key] = map.platformCategoryIdRef;
      }
    });

    // 4️⃣ Build category map for tree construction
    const categoryMap = {};
    categories.forEach((cat) => {
      categoryMap[cat.categorySlug] = {
        ...cat,
        children: [],
        platformCategoryData: mappingMap[String(cat.marketplaceCategoryId)] || null,
      };
    });

    // 5️⃣ Filter by searchTerm (if provided) and include ancestors
    let categoriesToInclude = categories;
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      const matched = categories.filter((cat) => regex.test(cat.categoryName));

      // Include ancestor slugs from categoryTrail
      const ancestorSlugs = new Set();
      matched.forEach((cat) => {
        if (cat.categoryTrail) {
          const parts = cat.categoryTrail.split('>').map((p) => p.trim());
          parts.pop(); // remove the category itself
          parts.forEach((slug) => ancestorSlugs.add(slug));
        }
      });

      // Filter categories: matched + ancestors
      categoriesToInclude = categories.filter((cat) => matched.includes(cat) || ancestorSlugs.has(cat.categorySlug));
    }

    // 6️⃣ Pre-group children for faster tree construction
    const childrenMap = {};
    categoriesToInclude.forEach((cat) => {
      if (!childrenMap[cat.parent]) childrenMap[cat.parent] = [];
      childrenMap[cat.parent].push(categoryMap[cat.categorySlug]);
    });

    // 7️⃣ Recursive tree builder
    const buildNode = (cat) => {
      const node = { ...cat, children: [] };
      const children = childrenMap[cat.categorySlug] || [];
      node.children = children.map(buildNode);
      return node;
    };

    // 8️⃣ Build tree starting from roots (parent null or missing)
    const tree = (childrenMap[null] || []).map(buildNode);

    return tree;
  } catch (err) {
    console.error('Error building marketplace category tree:', err);
    throw err;
  }
};
