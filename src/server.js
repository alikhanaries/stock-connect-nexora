import { config } from './config/config.js';
import app from './app.js';
import db from './config/db.js';
import { startChannelEngineWorker, stopChannelEngineWorker } from './queues/channelEngineWorker.js';
import { closeChannelEngineQueueConnections } from './service/channelEngineClient.js';

const PORT = config.PORT;
let isShuttingDown = false;

const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  db.connect()
    .then(async () => {
      console.log('MongoDB Connected');
      if (!config.START_CE_WORKER) {
        return;
      }
      try {
        await startChannelEngineWorker();
      } catch (err) {
        console.error('Channel Engine queue worker failed to start:', err.message);
      }
    })
    .catch((err) => {
      console.error('Failed to connect to DB:', err);
    });
});

const gracefulShutdown = async (source) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (source) {
    console.log(`Starting graceful shutdown (${source})...`);
  } else {
    console.log('Starting graceful shutdown...');
  }

  try {
    if (config.START_CE_WORKER) {
      await stopChannelEngineWorker();
    }
    await closeChannelEngineQueueConnections();
    await db.disconnect();
    console.log('Mongoose disconnected');
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

const handleFatalProcessError = (label, reason) => {
  console.error(`${label}:`, reason);
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
  gracefulShutdown(label);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => handleFatalProcessError('unhandledRejection', reason));
process.on('uncaughtException', (error) => handleFatalProcessError('uncaughtException', error));
