import { config } from './config/config.js';
import app from './app.js';
import db from './config/db.js';
import { startChannelEngineWorker, stopChannelEngineWorker } from './queues/channelEngineWorker.js';
import { closeChannelEngineQueueConnections } from './service/channelEngineClient.js';

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  db.connect()
    .then(async () => {
      console.log('MongoDB Connected');
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

const gracefulShutdown = async () => {
  console.log('Starting graceful shutdown...');
  try {
    await stopChannelEngineWorker();
    await closeChannelEngineQueueConnections();
    await db.disconnect();
    console.log('Mongoose disconnected');
    app?.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('Error disconnecting from Mongoose:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
