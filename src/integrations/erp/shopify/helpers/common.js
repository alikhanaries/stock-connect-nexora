export const extractImages = (product, variant) => {
  // Use variant images if available, otherwise fallback to product images
  const allImages = variant?.images?.length ? variant.images : product?.images || [];

  // Determine primary image
  const primary = variant?.imageUrl || product?.image?.url || allImages[0]?.url || '';

  // Extract URLs of all images
  const imagesArray = allImages.map((img) => img.url || '').filter(Boolean);

  return {
    primaryImageUrl: primary,
    imageUrl: primary,
    images: imagesArray,
    extraImageUrl1: allImages[1]?.url || '',
    extraImageUrl2: allImages[2]?.url || '',
    extraImageUrl3: allImages[3]?.url || '',
  };
};
