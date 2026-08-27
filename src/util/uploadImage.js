import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';
import sharp from 'sharp';
import { fetchSafeImageBuffer } from './safeImageFetch.js';

const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'avif']);

export const uploadImageFromUrl = async (imageUrl, fileKey) => {
  try {
    const buffer = await fetchSafeImageBuffer(imageUrl);
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format || !metadata.width || !metadata.height) {
      console.error(`Skipping image (invalid bitmap): ${imageUrl}`);
      return null;
    }

    if (!ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
      console.error(`Skipping image (unsupported format ${metadata.format}): ${imageUrl}`);
      return null;
    }

    const imageToJpgUsingBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();

    await s3Client.send(
      new PutObjectCommand({
        Bucket: 'product',
        Key: fileKey,
        Body: imageToJpgUsingBuffer,
        ContentType: 'image/jpeg',
      })
    );
    return true;
  } catch (error) {
    console.error(`[ERROR] upload failed url=${imageUrl} key=${fileKey}`);
    console.error(error.stack || error.message);
    return null;
  }
};
