import { config } from './config.js';

const requiredVars = ['DB_URL', 'JWT_SECRET'];

export const validateConfig = () => {
  const missing = requiredVars.filter((key) => !config[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};
