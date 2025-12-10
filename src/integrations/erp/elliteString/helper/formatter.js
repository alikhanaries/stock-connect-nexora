export function formatElliteStringProducts(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const cleanRows = rows.slice(1); // directly skip first row ALWAYS
  return cleanRows
    .map((row) => {
      const keys = Object.keys(row);
      const skuKey = keys[0];
      const invKey = keys[2];

      const rawSku = String(row[skuKey] || '').trim();

      // Skip rows where SKU is a header (not real)
      if (/^(productsku|sku|inventory|product)/i.test(rawSku)) return null;

      const sku = rawSku;
      const inv = Number(row[invKey]) || 0;

      if (!sku) return null;

      return {
        productSkuCode: sku,
        currentStockCount: inv,
      };
    })

    .filter(Boolean);
}
