import { normalizeImageUrl } from '#root/src/helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '#root/src/util/uploadImage.js';
import { generateS3Key } from '#root/src/util/generateS3Key.js';
import { getPublicImageUrl } from '#root/src/util/getPublicImageUrl.js';
import pLimit from 'p-limit';

const IMAGE_CONCURRENCY = 10;
const limit = pLimit(IMAGE_CONCURRENCY);

export async function processProductImages(product, sellerId) {
  if (!product) return product;

  const rawImages = [
    product.primaryImageUrl,
    product.imageUrl,
    product.extraImageUrl1,
    product.extraImageUrl2,
    product.extraImageUrl3,
  ]
    .filter(Boolean)
    .map((url) => normalizeImageUrl(url));

  if (!rawImages.length) {
    return {
      ...product,
      primaryImageUrl: null,
      imageUrl: null,
      extraImageUrl1: null,
      extraImageUrl2: null,
      extraImageUrl3: null,
      images: [],
    };
  }

  const s3Keys = rawImages.map((img) => generateS3Key(img, sellerId));

  s3Keys.forEach((key, i) => {
    limit(() => uploadImageFromUrl(rawImages[i], key)).catch((err) =>
      console.error(`Async upload failed (${rawImages[i]}): ${err.message}`)
    );
  });

  const cdnUrls = s3Keys.map((key) => getPublicImageUrl(key));

  const [primaryImageUrl, imageUrl, extraImageUrl1, extraImageUrl2, extraImageUrl3] = cdnUrls;

  return {
    ...product,
    primaryImageUrl: primaryImageUrl || null,
    imageUrl: imageUrl || null,
    extraImageUrl1: extraImageUrl1 || null,
    extraImageUrl2: extraImageUrl2 || null,
    extraImageUrl3: extraImageUrl3 || null,
    images: cdnUrls,
  };
}
