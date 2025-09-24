import slugify from 'slugify';
import { generateMarketPlaceCategoryId } from './generateMarketPlaceCategoryId.js';

export const mapRowToMarketPlaceCategory = async (row, marketPlaceId) => {
  const modifiedArray = [];
  let rawPath = row.categoryPath?.trim();

  if (!rawPath) return [];
  const firstValue = rawPath
    .replace(/\b(Yes|No)$/i, '') // drop Yes/No
    .replace(/^"+|"+$/g, '') // drop quotes
    .replace(/^;+|;+$/g, '') // drop semicolons
    .trim();

  // Split into parts
  let trailParts = firstValue.split('>').map((p) => p.trim());

  // Clean each part: remove numbers, parentheses, quotes, semicolons
  const cleanParts = trailParts
    .map((p) =>
      p
        .replace(/\s*\([^)]+\)/g, '') // remove anything in parentheses
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
    trailDocs.push(part);

    modifiedArray.push({
      categoryName: categoryName?.trim().toLowerCase() || '',
      parent: parent?.trim().toLowerCase() || 'root',
      categorySlug,
      marketplaceCategoryId: marketplaceCategoryId,
      categoryTrail: trailDocs.join(' > ').toLowerCase(),
      marketPlaceId: parseInt(marketPlaceId),
    });

    parent = categorySlug?.trim().toLowerCase();
  }
  return modifiedArray;
};
