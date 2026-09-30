import pLimit from 'p-limit';
import { normalizeAndTranslateVariants } from './commonHelper.js';
import { isReachable, toHttps } from './storeProductImages.js';

const limit = pLimit(10);

const pictureUrls = (pictures = []) =>
  (Array.isArray(pictures) ? pictures : [])
    .map((pic) => (typeof pic === 'string' ? pic : pic?.picture))
    .filter((url) => typeof url === 'string' && url.trim() !== '')
    .map((url) => toHttps(url.trim()));

// Respire sends images on the parent product (variation_pictures is always empty), and
// some listed images no longer exist on its CDN, so check that at least one really opens.
const hasWorkingImage = async (product, variants) => {
  const urls = [...pictureUrls(product.pictures), ...variants.flatMap((v) => pictureUrls(v.variation_pictures))];
  for (const url of new Set(urls)) {
    if (await isReachable(url)) return true;
  }
  return false;
};

// A Respire product is synced only when it has:
//   - at least one working image (otherwise the whole product and all its SKUs are skipped)
//   - variants with stock, color and size (variants missing any of these are dropped;
//     if none are left the whole product is skipped)
export const filterSyncableProducts = async (products = []) => {
  const skipped = { noVariants: 0, noStockColorSize: 0, noWorkingImage: 0 };

  const checked = await Promise.all(
    products.map((p) =>
      limit(async () => {
        const variations = Array.isArray(p?.variatios) ? p.variatios : [];
        if (!variations.length) {
          skipped.noVariants++;
          return null;
        }

        const normalized = await normalizeAndTranslateVariants(variations);
        const valid = normalized.filter(
          (v) => Number(v.quantity || 0) > 0 && v.normalizedColor && (v.normalizedSize || v.originalSize)
        );
        if (!valid.length) {
          skipped.noStockColorSize++;
          return null;
        }

        if (!(await hasWorkingImage(p, valid))) {
          skipped.noWorkingImage++;
          return null;
        }

        const validIds = new Set(valid.map((v) => v.id));
        return { ...p, variatios: variations.filter((v) => validIds.has(v.id)) };
      })
    )
  );

  return { products: checked.filter(Boolean), skipped };
};
