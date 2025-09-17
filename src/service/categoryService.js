import MarketplaceCategory from '../models/MarketplaceCategory.js';
import slugify from 'slugify';
import { generateMarketplaceCategoryId } from '#utils/generateMarketplaceCategoryId.js';

export const insertCategoryTrail = async (categoryTrailArray, marketplaceId) => {
  try {
    for (const trail of categoryTrailArray) {
      const trailParts = trail
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean);

      let parent = null;
      const trailDocs = [];

      for (const part of trailParts) {
        const categoryName = part.toLowerCase();
        const categorySlug = slugify(categoryName, { lower: true });
        const marketplaceCategoryId = await generateMarketplaceCategoryId(
          marketplaceId,
          categoryName,
          categorySlug,
          parent
        );
        trailDocs.push(part);
        const query = {
          categoryName,
          parent: parent || null,
          marketplaceId,
          categoryTrail: trailDocs.join(' > '),
          categorySlug,
          marketplaceCategoryId,
        };

        const category = await MarketplaceCategory.findOneAndUpdate(
          query,
          { $setOnInsert: query }, // only insert if not exists
          { new: true, upsert: true }
        );

        parent = category._id;
      }
    }

    return true; // returns array of results for each trail
  } catch (err) {
    console.error('insertCategoryTrail error:', err);
    throw err;
  }
};
