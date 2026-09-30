import pLimit from 'p-limit';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client } from '#root/src/config/s3.js';
import { uploadImageFromUrl } from '#root/src/util/uploadImage.js';
import { generateS3Key } from '#root/src/util/generateS3Key.js';
import { getPublicImageUrl } from '#root/src/util/getPublicImageUrl.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';

const limit = pLimit(erpCommonConfig.IMAGE_CONCURRENCY);
const STORAGE_CHECK_TTL_MS = 10 * 60 * 1000;

// Respire's CDN serves every image over https too (http just 301-redirects there).
export const toHttps = (url) => String(url).replace(/^http:\/\//i, 'https://');

// Respire lists some images that its CDN no longer has (404), so check before saving.
export const isReachable = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return res.ok && /^image\//i.test(res.headers.get('content-type') || '');
  } catch {
    return false;
  }
};

// Checked once per 10 minutes: when storage credentials are rejected, every upload would
// download the image and then fail, so skip uploading entirely instead.
let storageCheck = { at: 0, available: null };
const isStorageAvailable = async () => {
  if (storageCheck.available !== null && Date.now() - storageCheck.at < STORAGE_CHECK_TTL_MS) {
    return storageCheck.available;
  }
  let available = true;
  try {
    await s3Client.send(new ListObjectsV2Command({ Bucket: 'product', MaxKeys: 1 }));
  } catch (err) {
    available = false;
    console.error(`[Respire] Image storage unavailable, using Respire image URLs directly: ${err.message}`);
  }
  storageCheck = { at: Date.now(), available };
  return available;
};

// Unlike the shared processProductImages (fire-and-forget), this waits for each image so
// only images that really exist get saved: uploaded to our storage when it's available,
// otherwise the original Respire URL. Dead Respire links are dropped.
export const storeRespireImages = async (imageUrls = [], sellerId) => {
  const urls = [...new Set(imageUrls.filter(Boolean).map(toHttps))];
  if (!urls.length) return [];

  const storageAvailable = await isStorageAvailable();

  const stored = await Promise.all(
    urls.map((url) =>
      limit(async () => {
        if (storageAvailable) {
          const key = generateS3Key(url, sellerId);
          if (await uploadImageFromUrl(url, key)) return getPublicImageUrl(key);
        }
        return (await isReachable(url)) ? url : null;
      })
    )
  );

  return stored.filter(Boolean);
};
