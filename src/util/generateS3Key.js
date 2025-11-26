export function generateS3Key(imageUrl, sellerId, sku) {
  const date = new Date();
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const ts = Date.now();
  return `${sellerId}/${Y}/${M}/${D}/${sku}_${ts}.jpg`;
}
