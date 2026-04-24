const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const filterInStockProducts = (productArray = []) =>
  productArray.reduce((acc, p) => {
    const variations = toArr(p?.variatios);
    if (!variations.length) {
      if (Number(p?.quantity || 0) > 0) acc.push(p);
      return acc;
    }
    const inStock = variations.filter((v) => Number(v.quantity || 0) > 0);
    if (!inStock.length) return acc;
    acc.push({ ...p, variatios: inStock });
    return acc;
  }, []);
