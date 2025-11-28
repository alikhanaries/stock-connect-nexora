import { v4 as uuidv4 } from 'uuid';

export function generateS3Key(imageUrl, sellerId) {
  const date = new Date();
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const ts = Date.now();
  const rendom = uuidv4();
  return `${sellerId}/${Y}/${M}/${D}/${ts}${rendom}`;
}
