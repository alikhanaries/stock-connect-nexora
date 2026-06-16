import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';
import sharp from 'sharp';

export const uploadImageFromUrl = async (imageUrl, fileKey) => {
  console.log(`[uploadImage] START url=${imageUrl} key=${fileKey}`);
  try {
    const response = await fetch(imageUrl, {
      headers: {
        Accept: 'image/jpeg,image/png',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      },
    });
    console.log(
      `[uploadImage] fetch status=${response.status} ok=${response.ok} contentType=${response.headers.get('content-type')}`
    );
    if (!response.ok) {
      console.error(`Skipping image (${response.status}): ${imageUrl}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[uploadImage] downloaded ${buffer.length} bytes key=${fileKey}`);

    const imageToJpgUsingBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
    console.log(`[uploadImage] sharp->jpeg ${imageToJpgUsingBuffer.length} bytes key=${fileKey}`);

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: 'product',
        Key: fileKey,
        Body: imageToJpgUsingBuffer,
        ContentType: 'image/jpeg',
      })
    );
    console.log(
      `[uploadImage] S3 PUT done key=${fileKey} httpStatus=${result?.$metadata?.httpStatusCode} etag=${result?.ETag}`
    );
    return true;
  } catch (error) {
    console.error(`[ERROR] upload failed url=${imageUrl} key=${fileKey}`);
    console.error(error.stack || error.message);
    return null;
  }
};
