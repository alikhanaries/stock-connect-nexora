import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { UPLOAD_DIR, deriveSafeExtension } from './tempFileCleanup.js';

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Error creating upload directory:', err);
  throw err;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = deriveSafeExtension(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
export default upload;
