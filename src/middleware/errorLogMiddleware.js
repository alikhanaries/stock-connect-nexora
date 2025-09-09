import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname replacement in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const errorLog = async (error) => {
  const logDir = path.resolve(__dirname, '../log');
  const logFile = path.join(logDir, 'error.log');

  // Create the log directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit' };

  const currentDate = new Date().toISOString();
  const formattedDate = currentDate.toLocaleDateString('en-GB', dateOptions);
  const formattedTime = currentDate.toLocaleTimeString('en-GB', timeOptions);

  const logData = `Date: ${formattedDate}, Time: ${formattedTime}\nError: ${error.message}\nStack Trace: ${error.stack}\n\n`;

  await fs.promises.appendFile(logFile, logData);
};
