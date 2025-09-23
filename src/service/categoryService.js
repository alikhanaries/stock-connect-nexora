import PlatformCategory from '../models/PlatformCategory.js';
import slugify from 'slugify';
import { generatePlatformCategoryId } from '#utils/generatePlatformCategoryId.js';

export const insertCategoryTrail = async (categoryTrailArray) => {
  try {
    for (const item of categoryTrailArray) {
      const { categoryTrail, channelId } = item;

      const trailParts = categoryTrail
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean);

      let parent = 'root';
      const trailDocs = [];

      for (const part of trailParts) {
        const categoryName = part.toLowerCase();
        const categorySlug = slugify(categoryName, { lower: true });
        const platformCategoryId = await generatePlatformCategoryId(
          channelId, // ✅ using channelId
          categoryName,
          categorySlug,
          parent
        );

        trailDocs.push(part);

        const query = {
          categoryName,
          parent: parent || 'root',
          marketPlaceId: channelId, // store channelId
          platformCategoryTrail: trailDocs.join(' > '),
          categorySlug,
          platformCategoryId,
          id: platformCategoryId,
        };

        await PlatformCategory.findOneAndUpdate(
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
