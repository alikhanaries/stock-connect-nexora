import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import apiRoutes from './routes/api.js';
import nebimApiRoutes from './integrations/erp/nebim/routes/api.js';
import kipApiRoutes from './integrations/erp/gurmenKip/routes/api.js';
import ramseyApiRoutes from './integrations/erp/gurmenRamsey/routes/api.js';
import eliteStringLaIntimoApiRoutes from './integrations/erp/eliteStringLaIntimo/routes/api.js';
import shopifyRoutes from './integrations/erp/shopify/routes/api.js';
import cronJob from './cronJobs/index.js';

import swaggerUi from 'swagger-ui-express';
import { loadSwagger } from './util/swagger.js';

const swaggerDocument = loadSwagger();

const app = express();
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    requestInterceptor: (req) => {
      req.headers['Accept-Language'] = 'en';
      return req;
    },
  })
);

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
app.use('/api/erp/elite_string_la_intimo', eliteStringLaIntimoApiRoutes);
app.use('/api/erp/shopify', shopifyRoutes);
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});
// Run cron jobs
cronJob.fetchReturnsCron();
cronJob.fetchInventoryStatusCron();
export default app;
