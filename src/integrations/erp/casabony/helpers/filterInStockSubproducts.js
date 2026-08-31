const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const filterInStockSubproducts = (productArray = []) => {
  const products = Array.isArray(productArray) ? productArray : [productArray];
  return products.reduce((acc, p) => {
    const subs = toArr(p?.UrunSecenek?.Secenek || p?.subproducts?.subproduct);
    if (!subs.length) {
      const mainStock = Number(p?.StokAdedi || p?.stock || 0);
      if (p?.StokAdedi !== undefined && mainStock <= 0) return acc;
      return acc.concat(p);
    }
    const inStock = subs.filter((s) => Number(s.StokAdedi || s.stock || s.variant_stock || 0) > 0);
    if (!inStock.length) return acc;

    if (p?.UrunSecenek) {
      acc.push({ ...p, UrunSecenek: { ...p.UrunSecenek, Secenek: inStock } });
    } else {
      acc.push({ ...p, subproducts: { ...p.subproducts, subproduct: inStock } });
    }
    return acc;
  }, []);
};
