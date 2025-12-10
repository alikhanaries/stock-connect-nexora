import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import apiRoutes from './routes/api.js';
import nebimApiRoutes from './integrations/erp/nebim/routes/api.js';
import kipApiRoutes from './integrations/erp/gurmenKip/routes/api.js';
import ramseyApiRoutes from './integrations/erp/gurmenRamsey/routes/api.js';
import elliteStringApiRoutes from './integrations/erp/elliteString/routes/api.js';

import cronJob from './cronJobs/index.js';
const app = express();

app.use(express.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send('API is running!');
});

app.use('/api', apiRoutes);
app.use('/api/erp/nebim', nebimApiRoutes);
app.use('/api/erp/kip', kipApiRoutes);
app.use('/api/erp/ramsey', ramseyApiRoutes);
app.use('/api/erp/ellite-string', elliteStringApiRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});
// Run cron jobs
cronJob.fetchReturnsCron();
export default app;
