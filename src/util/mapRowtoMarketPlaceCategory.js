import slugify from 'slugify';
import { generateMarketPlaceCategoryId } from './generateMarketPlaceCategoryId.js';

export const mapRowToMarketPlaceCategory = async (row, marketPlaceId) => {
  const modifiedArray = [];
  let rawPath = row.categoryPath?.trim();
  if (!rawPath) return [];

  // Split into parts
  const trailParts = rawPath.split('>').map((p) => p.trim());

  let parent = 'root';
  const trailDocs = [];

  for (let part of trailParts) {
    // Check Yes/No at the end of this part
    const matchYesNo = part.match(/(Yes|No)$/i);
    const yesOrNo = matchYesNo ? matchYesNo[1] : null;

    // Remove Yes/No from the part
    part = part.replace(/(Yes|No)$/i, '').trim();

    // Clean the part
    const cleanPart = part
      .replace(/\s*\([^)]+\)/g, '') // remove parentheses
      .replace(/["';]/g, '') // remove quotes/semicolons
      .replace(/\d+/g, '') // remove numbers
      .trim();

    if (!cleanPart) continue;

    const categoryName = cleanPart.toLowerCase();
    const categorySlug = slugify(categoryName, { lower: true });

    const marketplaceCategoryId = await generateMarketPlaceCategoryId(
      marketPlaceId,
      categoryName,
      categorySlug,
      parent
    );

    trailDocs.push(categoryName);

    modifiedArray.push({
      categoryName,
      parent,
      categorySlug,
      marketplaceCategoryId,
      categoryTrail: trailDocs.join(' > '),
      marketPlaceId: parseInt(marketPlaceId),
      isEligible: (yesOrNo ?? 'yes').toLowerCase() === 'yes',
    });

    parent = categorySlug;
  }

  return modifiedArray;
};
