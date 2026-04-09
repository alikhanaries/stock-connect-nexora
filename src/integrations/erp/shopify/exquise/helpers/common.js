export const extractImages = (product, variant, colorImages) => {
  // If color-specific images are provided, use them
  // Otherwise fall back to all product images (e.g. for grandparent)
  const imagesArray = colorImages?.length
    ? colorImages.map((img) => img.url || '').filter(Boolean)
    : (product?.images || []).map((img) => img.url || '').filter(Boolean);

  const primary = imagesArray[0] || '';

  return {
    primaryImageUrl: primary,
    imageUrl: primary,
    images: imagesArray,
    extraImageUrl1: imagesArray[1] || '',
    extraImageUrl2: imagesArray[2] || '',
    extraImageUrl3: imagesArray[3] || '',
  };
};

/**
 * Get color-specific images from the product images array.
 *
 * Strategy: find the color's primary image (variant.image.id) in the product images,
 * then collect all unassigned images FORWARD until hitting the next color's primary image.
 */
export const getColorImages = (productImages, colorVariants, allVariantImageIds) => {
  if (!productImages?.length || !colorVariants?.length) return [];

  // Build a set of image IDs that belong to this color's variants
  const currentColorImageIds = new Set();
  for (const variant of colorVariants) {
    if (variant.image?.id) currentColorImageIds.add(variant.image.id);
  }

  const colorPrimaryImageId = colorVariants[0]?.image?.id;
  if (!colorPrimaryImageId) return [];

  const primaryIdx = productImages.findIndex((img) => img.id === colorPrimaryImageId);
  if (primaryIdx === -1) return [];

  // Check if this is the first variant-assigned image in the array
  const isFirstVariantImage = !productImages.slice(0, primaryIdx).some((img) => allVariantImageIds.has(img.id));

  // If first variant image, also collect unassigned images before it (they belong to this color)
  const beforeImages = [];
  if (isFirstVariantImage) {
    for (let i = 0; i < primaryIdx; i++) {
      beforeImages.push(productImages[i]);
    }
  }

  // Collect images forward (after the primary) that are not assigned to another color
  // Skip images belonging to THIS color's variants, only break on OTHER color's images
  const afterImages = [];
  for (let i = primaryIdx + 1; i < productImages.length; i++) {
    const imgId = productImages[i].id;
    if (allVariantImageIds.has(imgId) && !currentColorImageIds.has(imgId)) break;
    afterImages.push(productImages[i]);
  }

  return [productImages[primaryIdx], ...beforeImages, ...afterImages];
};
