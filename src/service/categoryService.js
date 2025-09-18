import PlatformCategory from '../models/PlatformCategory.js';

import slugify from 'slugify';

export const getPlatformCategoriesService = async (searchTerm = '') => {
  try {
    // Fetch all categories (we need all for ancestor lookup)
    let allCategories = await PlatformCategory.find(
      {},
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
      }
    });

    // If search term provided, find matching categories
    let categoriesToInclude = allCategories;
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      const matched = allCategories.filter((cat) => regex.test(cat.categoryName));

      // Include ancestors
      const ancestorSlugs = new Set();
      matched.forEach((cat) => {
        const parts = cat.platformCategoryTrail.split('>').map((p) => slugify(p.trim(), { lower: true }));
        parts.pop(); // remove the category itself
        parts.forEach((slug) => ancestorSlugs.add(slug));
      });

      // Filter categories to include only matched + ancestors
      categoriesToInclude = allCategories.filter((cat) => matched.includes(cat) || ancestorSlugs.has(cat.categorySlug));
    }

    // Build lookup map
    const categoryMap = {};
    categoriesToInclude.forEach((cat) => {
      categoryMap[cat.categorySlug] = { ...cat, children: [] };
    });

    // Recursive tree builder
    const buildNode = (cat, visited = new Set()) => {
      if (!cat || visited.has(cat.categorySlug)) return null;
      visited.add(cat.categorySlug);

      const node = { ...cat, children: [] };
      categoriesToInclude
        .filter((child) => child.parent === cat.categorySlug)
        .forEach((child) => {
          const childNode = buildNode(categoryMap[child.categorySlug], new Set(visited));
          if (childNode) node.children.push(childNode);
        });

      return node;
    };

    // Build tree starting from parent: "root"
    const tree = categoriesToInclude
      .filter((cat) => cat.parent === 'root')
      .map((rootCat) => buildNode(categoryMap[rootCat.categorySlug]));

    return tree;
  } catch (err) {
    console.error('Error building platform category tree:', err);
    throw err;
  }
};
