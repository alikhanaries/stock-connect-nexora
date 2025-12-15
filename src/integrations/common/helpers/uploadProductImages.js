import { normalizeImageUrl } from '#root/src/helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '#root/src/util/uploadImage.js';
import { generateS3Key } from '#root/src/util/generateS3Key.js';
import { getPublicImageUrl } from '#root/src/util/getPublicImageUrl.js';
import { erpCommonConfig } from '../config/config.js';
import pLimit from 'p-limit';
const { IMAGE_CONCURRENCY } = erpCommonConfig;
const limit = pLimit(IMAGE_CONCURRENCY);

export async function processProductImages(imageList = [], sellerId) {
  const rawImages = imageList.filter(Boolean).map((url) => normalizeImageUrl(url));
  if (!rawImages.length) return [];
  const s3Keys = rawImages.map((img) => generateS3Key(img, sellerId));

  s3Keys.forEach((key, i) => {
    limit(() => uploadImageFromUrl(rawImages[i], key)).catch((err) =>
      console.error(`Async upload failed (${rawImages[i]}): ${err.message}`)
    );
  });

  return s3Keys.map((key) => getPublicImageUrl(key));
}
