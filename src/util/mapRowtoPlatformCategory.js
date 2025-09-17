import slugify from 'slugify';
import { generatePlatformCategoryId } from './generatePlatformCategoryId.js';

export const mapRowToPlatFormCategory = async (row) => {
  const modifiedArray = [];
  let rawPath = row.categoryPath?.trim();
  if (!rawPath) return null;

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
    const platformCategoryId = await generatePlatformCategoryId(categoryName, categorySlug, parent);
    trailDocs.push(part);

    modifiedArray.push({
      id: platformCategoryId,
      categoryName: categoryName?.trim().toLowerCase() || '',
      parent: parent?.trim().toLowerCase() || 'root',
      categorySlug,
      platformCategoryId: platformCategoryId,
      platformCategoryTrail: trailDocs.join(' > ').toLowerCase(),
    });

    parent = categorySlug?.trim().toLowerCase();
  }
  return modifiedArray;
};
