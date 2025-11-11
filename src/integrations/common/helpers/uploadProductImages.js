import { normalizeImageUrl } from '#root/src/helpers/NormalizeImageUrl.js';
import { uploadImageFromUrl } from '#root/src/util/uploadImage.js';
import pLimit from 'p-limit';
import { erpCommonConfig } from '../config/config.js';

const { IMAGE_CONCURRENCY } = erpCommonConfig;
const limit = pLimit(IMAGE_CONCURRENCY);

export const uploadProductImages = async (product, sellerId) => {
  if (!product) return product;
  const allImageUrls = [
    product.primaryImageUrl,
    product.imageUrl,
    product.extraImageUrl1,
    product.extraImageUrl2,
    product.extraImageUrl3,
  ]
    .filter(Boolean)
    .map((url) => normalizeImageUrl(url.trim()));

  if (allImageUrls.length === 0) return { ...product, images: [] };

  const uploadedUrls = await Promise.all(
    allImageUrls.map((imgUrl) =>
      limit(async () => {
        try {
          return await uploadImageFromUrl(imgUrl, sellerId);
        } catch (err) {
          console.error(`Failed to upload image [${imgUrl}]: ${err.message}`);
          return null;
        }
      })
    )
  );
  const validUploadedUrls = uploadedUrls.filter(Boolean);
  const [primaryImageUrl, imageUrl, extraImageUrl1, extraImageUrl2, extraImageUrl3] = validUploadedUrls;
  return {
    ...product,
    primaryImageUrl: primaryImageUrl || '',
    imageUrl: imageUrl || '',
    extraImageUrl1: extraImageUrl1 || '',
    extraImageUrl2: extraImageUrl2 || '',
    extraImageUrl3: extraImageUrl3 || '',
    images: validUploadedUrls || [],
  };
};
