import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const BACKUP_DIR = process.env.BACKUP_DIR;
const MONGO_URI = process.env.DB_URL;
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 7);

export const runDbBackup = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }

  const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('DB Backup failed:', error.message);
      if (stderr) console.error('stderr:', stderr);
      return;
    }

    if (stdout) console.log('stdout:', stdout);
    if (stderr) console.warn('stderr:', stderr);

    console.log('DB Backup successful:', backupPath);
    cleanupOldBackups();
  });
};

const cleanupOldBackups = () => {
  const now = Date.now();
  const retentionTime = RETENTION_DAYS * 24 * 60 * 60 * 1000;

  fs.readdirSync(BACKUP_DIR).forEach((folder) => {
    const folderPath = path.join(BACKUP_DIR, folder);
    const stats = fs.statSync(folderPath);

    if (now - stats.mtimeMs > retentionTime) {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log('Removed old backup:', folder);
    }
  });
};
console.log('MONGO_URI:', !!process.env.DB_URL);
console.log('BACKUP_DIR:', process.env.BACKUP_DIR);
console.log('RETENTION_DAYS:', process.env.BACKUP_RETENTION_DAYS);
