import { config } from '#config/config.js';
const { ENDPOINT } = config;

export const getPublicImageUrl = (fileKey) => {
  if (!fileKey) return null;
  const cleanKey = fileKey.replace(/^\/+/, '');
  return `${ENDPOINT}/product/${cleanKey}`;
};
