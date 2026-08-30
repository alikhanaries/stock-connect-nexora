export const filterProductsWithImages = (productArray = []) => {
  if (!Array.isArray(productArray)) return [];

  return productArray.filter((p) => {
    const hasRootPictures =
      Array.isArray(p?.pictures) &&
      p.pictures.some((pic) => (typeof pic === 'string' ? pic.trim() !== '' : Boolean(pic?.picture)));

    if (hasRootPictures) return true;

    const hasVariationPictures =
      Array.isArray(p?.variatios) &&
      p.variatios.some(
        (v) =>
          Array.isArray(v?.variation_pictures) &&
          v.variation_pictures.some((vp) => (typeof vp === 'string' ? vp.trim() !== '' : Boolean(vp?.picture)))
      );

    return hasVariationPictures;
  });
};
