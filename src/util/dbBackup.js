import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { MongoClient } from 'mongodb';
import { uploadFileToS3 } from '../service/s3Service.js';

const BACKUP_DIR = process.env.BACKUP_DIR;
const MONGO_URI = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME;
const S3_BUCKET = process.env.S3_BUCKET_DB_BACKUP;
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 2);

export const runDbBackup = async () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  cleanupOldBackups();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpDir = path.join(BACKUP_DIR, `json-dump-${timestamp}`);
  const archivePath = `${dumpDir}.tar.gz`;

  fs.mkdirSync(dumpDir, { recursive: true });

  console.log('Starting JSON DB export…');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();

  for (const { name } of collections) {
    const data = await db.collection(name).find({}).toArray();

    const filePath = path.join(dumpDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    console.log(`Exported ${name} (${data.length} docs)`);
  }

  await client.close();

  await execPromise(`tar -czf "${archivePath}" -C "${BACKUP_DIR}" "${path.basename(dumpDir)}"`);

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
