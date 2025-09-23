import PlatformCategory from '../models/PlatformCategory.js';
import Channel from '../models/Channel.js';
import slugify from 'slugify';

export const getPlatformCategoriesService = async (searchTerm = '', marketPlaceId) => {
  try {
    // Fetch all categories
    let allCategories = await PlatformCategory.find(
      { marketPlaceId: parseInt(marketPlaceId) },
      {
        _id: 1,
        categoryName: 1,
        parent: 1,
        platformCategoryId: 1,
        platformCategoryTrail: 1,
        categorySlug: 1,
      }
    ).lean();

    // Normalize parent using trail
    allCategories.forEach((cat) => {
      if (cat.platformCategoryTrail) {
        const parts = cat.platformCategoryTrail.split('>').map((p) => p.trim());
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
        (cat) => safeRegex.test(cat.categoryName) || safeRegex.test(cat.platformCategoryTrail)
      );

      // Include ancestors
      const ancestorSlugs = new Set();
      matched.forEach((cat) => {
        const parts = cat.platformCategoryTrail.split('>').map((p) => slugify(p.trim(), { lower: true }));
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

    const channelData = await Channel.findOne({ channelId: parseInt(marketPlaceId) }, { channelName: 1, channelId: 1 });
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
