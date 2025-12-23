import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { uploadFileToS3 } from '../service/s3Service.js';

const requiredEnvVars = ['BACKUP_DIR', 'DB_URL', 'S3_BUCKET_DB_BACKUP'];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const BACKUP_DIR = process.env.BACKUP_DIR;
const MONGO_URI = process.env.DB_URL;
const S3_BUCKET = process.env.S3_BUCKET_DB_BACKUP;
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 2);

export const runDbBackup = async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tmpDir = os.tmpdir();
  const dumpDir = path.join(tmpDir, `dump-${timestamp}`);
  const archivePath = path.join(tmpDir, `dump-${timestamp}.tar.gz`);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (fs.existsSync(BACKUP_DIR)) {
    cleanupOldBackups();
  }

  await execPromise(`mongodump --uri="${MONGO_URI}" --out="${dumpDir}"`);
  await execPromise(`tar -czf ${archivePath} -C ${tmpDir} dump-${timestamp}`);

  await uploadFileToS3(archivePath, `db-backups/${path.basename(archivePath)}`, S3_BUCKET);

  console.log('Uploaded to S3:', archivePath);

  fs.rmSync(dumpDir, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });
};

const execPromise = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stderr) console.warn(stderr);
      resolve(stdout);
    });
  });

const cleanupOldBackups = () => {
  const now = Date.now();
  const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

  fs.readdirSync(BACKUP_DIR).forEach((file) => {
    const fullPath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(fullPath);

    if (now - stats.mtimeMs > retentionMs) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log('Removed old backup:', file);
    }
  });
};
