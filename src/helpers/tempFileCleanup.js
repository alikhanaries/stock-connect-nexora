import path from 'path';
import fs from 'fs/promises';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export const isPathInsideUploadDir = (filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  const resolved = path.resolve(filePath);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  const relative = path.relative(uploadRoot, resolved);

  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const deriveSafeExtension = (originalname, defaultExt = '') => {
  if (!originalname || typeof originalname !== 'string') {
    return defaultExt;
  }

  const base = path.basename(originalname);
  const match = base.match(/\.([a-zA-Z0-9]{1,10})$/);
  if (!match) {
    return defaultExt;
  }

  return `.${match[1].toLowerCase()}`;
};

export const safeUnlinkTempFile = async (filePath) => {
  if (!isPathInsideUploadDir(filePath)) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Temp file cleanup failed:', err.message);
    }
  }
};
