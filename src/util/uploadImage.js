import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';

export const uploadImageFromUrl = async (imageUrl, fileKey) => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Skipping image (${response.status}): ${imageUrl}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: 'product',
        Key: fileKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    console.log(result, 's3 result');
  } catch (error) {
    console.error(`[ERROR] upload failed for: ${imageUrl}`);
    console.error(error.message);
    return null;
  }
};
