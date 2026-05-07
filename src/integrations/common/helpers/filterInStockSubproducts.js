const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const filterInStockSubproducts = (productArray = []) =>
  productArray.reduce((acc, p) => {
    const subs = toArr(p?.subproducts?.subproduct);
    if (!subs.length) return acc.concat(p);
    const inStock = subs.filter((s) => Number(s.stock || s.variant_stock || 0) > 0);
    if (!inStock.length) return acc;
    acc.push({ ...p, subproducts: { ...p.subproducts, subproduct: inStock } });
    return acc;
  }, []);
