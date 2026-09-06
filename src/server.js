import { config } from './config/config.js';
import app from './app.js';
import db from './config/db.js';
import { validateConfig } from './config/validateConfig.js';
import { setDbReady, setQueueReady, setShuttingDown } from './config/serverState.js';
import { startChannelEngineWorker, stopChannelEngineWorker } from './queues/channelEngineWorker.js';
import { closeChannelEngineQueueConnections } from './service/channelEngineClient.js';

const PORT = config.PORT;
const SHUTDOWN_TIMEOUT_MS = 10000;

let server = null;
let isShuttingDown = false;

const closeHttpServer = () =>
  new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

const gracefulShutdown = async (source) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  setShuttingDown(true);
  setDbReady(false);
  setQueueReady(false);

  if (source) {
    console.log(`Starting graceful shutdown (${source})...`);
  } else {
    console.log('Starting graceful shutdown...');
  }

  const forceExitTimer = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await closeHttpServer();
    console.log('Server closed.');

    await stopChannelEngineWorker();
    await closeChannelEngineQueueConnections();
    await db.disconnect();
    console.log('Mongoose disconnected');

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

const startServer = async () => {
  validateConfig();

  try {
    await db.connect();
    setDbReady(true);
    console.log('MongoDB Connected');

    try {
      await startChannelEngineWorker();
      setQueueReady(true);
    } catch (err) {
      console.error('Channel Engine queue worker failed to start:', err.message);
      setQueueReady(false);
    }

    server = app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      if (typeof process.send === 'function') {
        process.send('ready');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
