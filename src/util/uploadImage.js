import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';

export const uploadImageFromUrl = async (imageUrl, fileKey) => {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/jpeg,image/png',
      },
    });
    if (!response.ok) {
      console.error(`Skipping image (${response.status}): ${imageUrl}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: 'product',
        Key: fileKey,
        Body: buffer,
        ContentType: 'image/jpeg',
      })
    );
    console.log(result, 's3 result');
  } catch (error) {
    console.error(`[ERROR] upload failed for: ${imageUrl}`);
    console.error(error.message);
    return null;
  }
};
