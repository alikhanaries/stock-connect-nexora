import MarketplaceCategory from '../models/MarketplaceCategory.js';

// export const getMarketplaceCategoriesService = async (marketplaceId) => {
//   try {
//     console.log(marketplaceId);
//     const data = await MarketplaceCategory.find({ marketplaceId });
//         console.log(data);
//     const categories = await MarketplaceCategory.aggregate([
//       // 1️⃣ Filter by marketplace
//       { $match: { marketplaceId: Number(marketplaceId) } },

//       // 2️⃣ Lookup mapping from CategoryMapping
//       {
//         $lookup: {
//           from: 'categorymappings', // collection name (Mongo lowercases model)
//           localField: 'marketplaceCategoryId',
//           foreignField: 'marketplaceCategoryId',
//           as: 'mapping',
//         },
//       },

//       // 3️⃣ Unwind mapping (if you want single match)
//       { $unwind: { path: '$mapping', preserveNullAndEmptyArrays: true } },

//       // 4️⃣ Lookup platform category
//       {
//         $lookup: {
//           from: 'platformcategories',
//           localField: 'mapping.platformCategoryIdRef',
//           foreignField: '_id',
//           as: 'platformCategory',
//         },
//       },

//       // 5️⃣ Flatten platformCategory
//       { $unwind: { path: '$platformCategory', preserveNullAndEmptyArrays: true } },

//       // 6️⃣ Final projection (customize fields you need)
//       {
//         $project: {
//           _id: 1,
//           categoryName: 1,
//           marketplaceCategoryId: 1,
//           categoryTrail: 1,
//           categorySlug: 1,
//           platformCategory: {
//             _id: 1,
//             categoryName: 1,
//             categorySlug: 1,
//             platformCategoryTrail: 1,
//           },
//         },
//       },
//     ]);
//     console.log('categories', categories);
//     return categories;
//   } catch (err) {
//     console.error('Error fetching marketplace categories:', err);
//     throw err;
//   }
// };
export const getMarketplaceCategoriesService = async (marketplaceId) => {
  try {
    const id = Number(marketplaceId);

    // 1️⃣ Fetch all categories flat
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

    // 2️⃣ Build a map for fast lookup
    const categoryMap = {};
    categories.forEach((cat) => {
      categoryMap[cat.categoryName] = { ...cat, children: [] };
    });

    // 3️⃣ Build the tree
    const tree = [];
    categories.forEach((cat) => {
      if (cat.parent && categoryMap[cat.parent]) {
        categoryMap[cat.parent].children.push(categoryMap[cat.categoryName]);
      } else {
        tree.push(categoryMap[cat.categoryName]); // root
      }
    });

    return tree;
  } catch (err) {
    console.error('Error building category tree:', err);
    throw err;
  }
};
