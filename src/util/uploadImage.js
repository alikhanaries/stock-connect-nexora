import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3.js';
import { config } from '#config/config.js';
const { ENDPOINT } = config;

const bucket = 'product';
const endpoint = ENDPOINT;

export const uploadImageFromUrl = async (imageUrl, sellerId) => {
  try {
    // Attempt to fetch image
    const response = await fetch(imageUrl);

    if (!response.ok) {
      console.error(`Skipping image (${response.status}): ${imageUrl}`);
      return null;
    }

    // Convert to buffer
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Generate a safe filename
    const baseName = path.basename(imageUrl).split('?')[0] || 'image.jpg';
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Folder by seller
    const folder = sellerId ? `${sellerId}` : 'uploads';
    const fileKey = `${folder}/${Date.now()}-${safeName}`;

    // Upload to S3
    const uploadParams = {
      Bucket: bucket,
      Key: fileKey,
      Body: Buffer.from(arrayBuffer),
      ContentType: contentType,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    // Return uploaded URL
    const uploadedUrl = `${endpoint.replace(/\/$/, '')}/${bucket}/${fileKey}`;
    return uploadedUrl;
  } catch (error) {
    console.error(`Upload failed for: ${imageUrl}`);
    console.error(error.message);
    return null;
  }
};
