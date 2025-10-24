import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import apiRoutes from './routes/api.js';
import nebimApiRoutes from './integrations/erp/nebim/routes/api.js';
const app = express();

app.use(express.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send('API is running!');
});

app.use('/api', apiRoutes);
app.use('/api/erp/nebim', nebimApiRoutes);
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

export default app;
