import MarketplaceCategory from '../models/MarketplaceCategory.js';
import slugify from 'slugify';
import { generateMarketplaceCategoryId } from '#utils/generateMarketplaceCategoryId.js';

export const insertCategoryTrail = async (categoryTrailArray) => {
  try {
    for (const item of categoryTrailArray) {
      const { categoryTrail, channelId } = item;

      const trailParts = categoryTrail
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean);

      let parent = null;
      const trailDocs = [];

      for (const part of trailParts) {
        const categoryName = part.toLowerCase();
        const categorySlug = slugify(categoryName, { lower: true });
        const marketplaceCategoryId = await generateMarketplaceCategoryId(
          channelId, // ✅ using channelId
          categoryName,
          categorySlug,
          parent
        );

        trailDocs.push(part);

        const query = {
          categoryName,
          parent: parent || null,
          marketplaceId: channelId, // store channelId
          categoryTrail: trailDocs.join(' > '),
          categorySlug,
          marketplaceCategoryId,
        };

        await MarketplaceCategory.findOneAndUpdate(
          query,
          { $setOnInsert: query }, // only insert if not exists
          { new: true, upsert: true }
        );

        parent = categorySlug;
      }
    }

    return true;
  } catch (err) {
    console.error('insertCategoryTrail error:', err);
    throw err;
  }
};
