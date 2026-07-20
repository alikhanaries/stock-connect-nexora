import { mapErpStyleImageFields } from '#helpers/productImageFields.js';

export const extractImages = (product, variant) => {
  // Use variant images if available, otherwise fallback to product images
  const allImages = variant?.images?.length ? variant.images : product?.images || [];

  // Determine primary image
  const primary = variant?.imageUrl || product?.image?.url || allImages[0]?.url || '';

  // Extract URLs of all images
  const imagesArray = allImages.map((img) => img.url || '').filter(Boolean);

  // Prefer explicit primary when set; still populate extras from full list
  const mapped = mapErpStyleImageFields(imagesArray.length ? imagesArray : primary ? [primary] : []);
  if (primary) {
    mapped.primaryImageUrl = primary;
    mapped.imageUrl = primary;
  }
  return mapped;
};
