import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '#config/config.js';

const { ACCESS_KEY, SECRET_KEY, ENDPOINT, REGION } = config;

const s3Client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});

export const uploadImage = async (file, fileName, bucket) => {
  try {
    const uploadParams = {
      Bucket: bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    const imageUrl = `${ENDPOINT}/${bucket}/${fileName}`;

    return imageUrl;
  } catch (error) {
    console.error('Error uploading image to s3:', error.message);
  }
};
export const uploadFileToS3 = async (filePath, s3Key, bucket) => {
  const fileBuffer = fs.readFileSync(filePath);
  const { size } = fs.statSync(filePath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentLength: size,
    })
  );
};
