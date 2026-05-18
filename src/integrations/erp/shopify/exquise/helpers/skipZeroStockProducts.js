export const skipZeroStockProducts = (productArray = []) =>
  productArray.reduce((acc, p) => {
    const variants = Array.isArray(p?.variants) ? p.variants : [];
    if (!variants.length) return acc;
    const inStock = variants.filter((v) => Number(v?.stock || 0) > 0);
    if (!inStock.length) return acc;
    acc.push({ ...p, variants: inStock });
    return acc;
  }, []);
