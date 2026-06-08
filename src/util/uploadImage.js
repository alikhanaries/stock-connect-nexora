import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';
import sharp from 'sharp';

export const uploadImageFromUrl = async (imageUrl, fileKey) => {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/jpeg,image/png',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      console.error(`Skipping image (${response.status}): ${imageUrl}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageToJpgUsingBuffer = await sharp(buffer)
      // Fill transparency with pure white.
      .flatten({ background: '#ffffff' })
      // Convert near-white pixels to pure white.
      .linear(255 / 244, 0)
      // Export as JPEG.
      .jpeg({ quality: 90 })
      .toBuffer();

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
    console.error(`[ERROR] upload failed for: ${imageUrl}`);
    console.error(error.message);
    return null;
  }
};
