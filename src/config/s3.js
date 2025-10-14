import { S3Client } from '@aws-sdk/client-s3';
import { config } from '#config/config.js';
const { ENDPOINT, REGION, ACCESS_KEY, SECRET_KEY } = config;

export const s3Client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});
