import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import apiRoutes from './routes/api.js';
import cronJob from './cronJobs/index.js';
const app = express();

app.use(express.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send('API is running!');
});

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});
// Run cron jobs
cronJob.fetchReturnsCron();
export default app;
