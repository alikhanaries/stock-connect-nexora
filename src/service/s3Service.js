import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '#config/config.js';

const accesskey = config.ACCESS_KEY;
const secretkey = config.SECRET_KEY;
const endpoint = config.ENDPOINT;
const region = config.REGION;

const s3Client = new S3Client({
  endpoint: endpoint,
  region: region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: accesskey,
    secretAccessKey: secretkey,
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
    const imageUrl = `${endpoint}/${bucket}/${fileName}`;

    return imageUrl;
  } catch (error) {
    console.error('Error uploading image to s3:', error.message);
  }
};
