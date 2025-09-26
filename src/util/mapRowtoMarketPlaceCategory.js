import slugify from 'slugify';
import { generateMarketPlaceCategoryId } from './generateMarketPlaceCategoryId.js';

export const mapRowToMarketPlaceCategory = async (row, marketPlaceId) => {
  const modifiedArray = [];
  let rawPath = row.categoryPath?.trim();

  if (!rawPath) return [];

  // Extract Yes/No at the end (case-insensitive)
  const matchYesNo = rawPath.match(/\b(Yes|No)$/i);
  const yesOrNo = matchYesNo ? matchYesNo[1] : null;

  // Remove Yes/No from the path
  // Remove Yes/No at the end, even if attached to a word
  const cleanedPath = rawPath.replace(/(Yes|No)$/i, '').trim();

  // Split into parts
  const trailParts = cleanedPath.split('>').map((p) => p.trim());

  // Clean each part
  const cleanParts = trailParts
    .map((p) =>
      p
        .replace(/\s*\([^)]+\)/g, '') // remove parentheses
        .replace(/["';]/g, '') // remove quotes/semicolons
        .replace(/\d+/g, '') // remove numbers
        .trim()
    )
    .filter(Boolean);

  let parent = 'root';
  const trailDocs = [];

  for (const part of cleanParts) {
    const categoryName = part.toLowerCase();
    const categorySlug = slugify(categoryName, { lower: true });

    const marketplaceCategoryId = await generateMarketPlaceCategoryId(
      marketPlaceId,
      categoryName,
      categorySlug,
      parent
    );

    trailDocs.push(categoryName); // use lowercase name consistently

    modifiedArray.push({
      categoryName: categoryName,
      parent,
      categorySlug,
      marketplaceCategoryId,
      categoryTrail: trailDocs.join(' > '),
      marketPlaceId: parseInt(marketPlaceId),
      isEligible: yesOrNo?.toLowerCase() === 'yes',
    });

    parent = categorySlug;
  }

  return modifiedArray;
};
