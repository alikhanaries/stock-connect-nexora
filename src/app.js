import express from 'express';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import apiRoutes from './routes/api.js';
import nebimApiRoutes from './integrations/erp/nebim/routes/api.js';
import kipApiRoutes from './integrations/erp/gurmenKip/routes/api.js';
import entegraRoutes from './integrations/erp/entegra/routes/api.js';
import ramseyApiRoutes from './integrations/erp/gurmenRamsey/routes/api.js';
import eliteStringLaIntimoApiRoutes from './integrations/erp/eliteStringLaIntimo/routes/api.js';
import shopifyRoutes from './integrations/erp/shopify/routes/api.js';
import shopifyExquiseRoutes from './integrations/erp/shopify/exquise/routes/api.js';
import shopifyCatchRoutes from './integrations/erp/shopify/catch/routes/api.js';
import shopifyXokidsRoutes from './integrations/erp/shopify/xokids/routes/api.js';
import unicommerceRoutes from './integrations/erp/unicommerce/routes/api.js';
import xokidsRoutes from './integrations/erp/xokids/routes/api.js';
import meneviskidsRoutes from './integrations/erp/meneviskids/routes/api.js';
import cronJob from './cronJobs/index.js';
import swaggerUi from 'swagger-ui-express';
import { loadSwagger, loadUniCommerceSwagger } from './util/swagger.js';
import { apiLogMiddleware } from './middleware/apiLogMiddleware.js';

const swaggerDocument = loadSwagger();
const uniSwaggerDocument = loadUniCommerceSwagger();

const app = express();

function setupSwagger(path, swaggerSpec, options = {}) {
  app.use(path, swaggerUi.serveFiles(swaggerSpec, {}), swaggerUi.setup(swaggerSpec, options));
}

app.get('/swagger.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json(swaggerDocument);
});

setupSwagger('/api-docs', swaggerDocument, {
  requestInterceptor: (req) => {
    req.headers['Accept-Language'] = 'en';
    return req;
  },
});

setupSwagger('/unicommerce-docs', uniSwaggerDocument, {
  requestInterceptor: (req) => {
    req.headers['Accept-Language'] = 'en';
    return req;
  },
});

app.use(express.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send('API is running!');
});

app.use('/api', apiLogMiddleware);

app.use('/api', apiRoutes);
app.use('/api/erp/nebim', nebimApiRoutes);
app.use('/api/erp/kip', kipApiRoutes);
app.use('/api/erp/entegra', entegraRoutes);
app.use('/api/erp/ramsey', ramseyApiRoutes);
app.use('/api/erp/elite_string_la_intimo', eliteStringLaIntimoApiRoutes);
app.use('/api/erp/shopify', shopifyRoutes);
app.use('/api/erp/shopify/exquise', shopifyExquiseRoutes);
app.use('/api/erp/shopify/catch', shopifyCatchRoutes);
app.use('/api/erp/shopify/xokids', shopifyXokidsRoutes);
app.use('/api/erp/unicommerce', unicommerceRoutes);
app.use('/api/erp/xokids', xokidsRoutes);
app.use('/api/erp/meneviskids', meneviskidsRoutes);
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Run cron jobs
cronJob.scheduledCronJobs();

export default app;
