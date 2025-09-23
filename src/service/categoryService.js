import MarketplaceCategory from '../models/MarketplaceCategory.js';
import Channel from '../models/Channel.js';
import slugify from 'slugify';
export const getMarketplaceCategoriesService = async (marketplaceId, searchTerm = '') => {
  try {
    // Fetch all categories
    let allCategories = await MarketplaceCategory.find(
      { marketPlaceId: parseInt(marketplaceId) },
      {
        _id: 1,
        categoryName: 1,
        parent: 1,
        marketplaceCategoryId: 1,
        categoryTrail: 1,
        categorySlug: 1,
      }
    ).lean();
    if (!allCategories.length) return [];
    // Normalize parent using trail
    allCategories.forEach((cat) => {
      if (cat.categoryTrail) {
        const parts = cat.categoryTrail.split('>').map((p) => p.trim());
        cat.parent = parts.length > 1 ? slugify(parts[parts.length - 2], { lower: true }) : 'root';
      } else {
        cat.parent = 'root';
      }
    });

    // Filter by search term if provided
    let categoriesToInclude = allCategories;
    if (searchTerm) {
      const safeRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

      const matched = allCategories.filter(
        (cat) => safeRegex.test(cat.categoryName) || safeRegex.test(cat.categoryTrail)
      );

      // Include ancestors
      const ancestorSlugs = new Set();
      matched.forEach((cat) => {
        const parts = cat.categoryTrail.split('>').map((p) => slugify(p.trim(), { lower: true }));
        parts.pop(); // remove self
        parts.forEach((slug) => ancestorSlugs.add(slug));
      });

      categoriesToInclude = allCategories.filter((cat) => matched.includes(cat) || ancestorSlugs.has(cat.categorySlug));
    }

    // Build lookup maps
    const categoryMap = {}; // slug -> category
    const childrenByParent = {}; // parentSlug -> [childSlugs]

    categoriesToInclude.forEach((cat) => {
      categoryMap[cat.categorySlug] = { ...cat, children: [] };
      const parentSlug = cat.parent || 'root';
      if (!childrenByParent[parentSlug]) childrenByParent[parentSlug] = [];
      childrenByParent[parentSlug].push(cat.categorySlug);
    });

    // Recursive tree builder using childrenByParent map
    const buildNode = (cat, visited = new Set()) => {
      if (!cat || visited.has(cat.categorySlug)) return null;
      visited.add(cat.categorySlug);

      const node = { ...cat, children: [] };
      (childrenByParent[cat.categorySlug] || []).forEach((childSlug) => {
        const childNode = buildNode(categoryMap[childSlug], new Set(visited));
        if (childNode) node.children.push(childNode);
      });

      return node;
    };

    // Build tree from root nodes
    const tree = (childrenByParent['root'] || []).map((rootSlug) => buildNode(categoryMap[rootSlug]));

    const channelData = await Channel.findOne(
      { channelId: parseInt(marketplaceId) },
      { channelName: 1, channelId: 1 }
    ).lean();
    if (channelData) {
      return {
        categoryName: channelData?.channelName,
        id: channelData?.channelId,
        children: tree,
      };
    }

    return tree;
  } catch (err) {
    console.error('Error building platform category tree:', err);
    throw err;
  }
};
