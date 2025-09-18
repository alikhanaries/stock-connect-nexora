import PlatformCategory from '../models/PlatformCategory.js';

// export const getPlatformCategoriesService = async () => {
//   try {
//     const categories = await PlatformCategory.find(
//       {},
//       {
//         _id: 1,
//         categoryName: 1,
//         parent: 1, // parent is the categorySlug of the parent
//         platformCategoryId: 1,
//         platformCategoryTrail: 1,
//         categorySlug: 1,
//       }
//     ).lean();

//     // Lookup map for quick access
//     const categoryMap = {};
//     categories.forEach((cat) => {
//       categoryMap[cat.categorySlug] = { ...cat };
//     });

//     // Recursive builder with visited set to prevent cycles
//     const buildNode = (cat, visited = new Set()) => {
//       if (!cat || visited.has(cat.categorySlug)) return null;

//       visited.add(cat.categorySlug);

//       const node = { ...cat, children: [] };

//       categories
//         .filter((child) => child.parent === cat.categorySlug)
//         .forEach((child) => {
//           const childNode = buildNode(categoryMap[child.categorySlug], new Set(visited));
//           if (childNode) node.children.push(childNode);
//         });

//       return node;
//     };

//     // Build tree starting from parent: "root"
//     const tree = categories
//       .filter((cat) => cat.parent === 'root')
//       .map((rootCat) => buildNode(categoryMap[rootCat.categorySlug]));

//     return tree;
//   } catch (err) {
//     console.error('Error building platform category tree:', err);
//     throw err;
//   }
// };

import slugify from 'slugify';

export const getPlatformCategoriesService = async () => {
  try {
    const categories = await PlatformCategory.find(
      {},
      {
        _id: 1,
        categoryName: 1,
        parent: 1, // may be incorrect
        platformCategoryId: 1,
        platformCategoryTrail: 1,
        categorySlug: 1,
      }
    ).lean();

    // Fix parent dynamically using platformCategoryTrail
    categories.forEach((cat) => {
      if (cat.platformCategoryTrail) {
        const parts = cat.platformCategoryTrail.split('>').map((p) => p.trim());
        if (parts.length > 1) {
          // second-to-last part = actual parent
          cat.parent = slugify(parts[parts.length - 2], { lower: true });
        } else {
          cat.parent = 'root';
        }
      }
    });

    // Build lookup map
    const categoryMap = {};
    categories.forEach((cat) => {
      categoryMap[cat.categorySlug] = { ...cat, children: [] };
    });

    // Recursive builder
    const buildNode = (cat, visited = new Set()) => {
      if (!cat || visited.has(cat.categorySlug)) return null;

      visited.add(cat.categorySlug);

      const node = { ...cat, children: [] };

      categories
        .filter((child) => child.parent === cat.categorySlug)
        .forEach((child) => {
          const childNode = buildNode(categoryMap[child.categorySlug], new Set(visited));
          if (childNode) node.children.push(childNode);
        });

      return node;
    };

    // Start tree from parent: "root"
    const tree = categories
      .filter((cat) => cat.parent === 'root')
      .map((rootCat) => buildNode(categoryMap[rootCat.categorySlug]));

    return tree;
  } catch (err) {
    console.error('Error building platform category tree:', err);
    throw err;
  }
};
