import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { config } from '#config/config.js';

export function loadSwagger() {
  const spec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Stock Connect API',
        description: 'API documentation for the Stock Connect backend service.',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT || 3000}/api`,
          description: 'Local development',
        },
        {
          url: `${(config.BASE_URL || `http://localhost:${config.PORT || 3000}/`).replace(/\/$/, '')}/api`,
          description: 'BASE_URL from server environment (.env)',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Authentication' },
        { name: 'Users', description: 'User management' },
        { name: 'Sellers', description: 'Seller management' },
        { name: 'Products', description: 'Product management' },
        { name: 'Orders', description: 'Order management' },
        { name: 'Channels', description: 'Channel management' },
        { name: 'Categories', description: 'Category management' },
        { name: 'Returns', description: 'Return management' },
        { name: 'Shipments', description: 'Shipment management' },
        { name: 'Invoices', description: 'Invoice management' },
        { name: 'API Logs', description: 'Master-admin API call audit and performance logs' },
        { name: 'Sentos ERP', description: 'Sentos ERP product, inventory, price, and connection APIs' },
        {
          name: 'UniCommerce',
          description:
            'Inbound Uniware OMS → StockConnect (/erp/unicommerce/*). Authenticate via apiKey header (JWT from authToken).',
        },
        {
          name: 'UniCommerce Outbound (External Contract)',
          description:
            'Documentation-only contracts for UniCommerce Generic Proxy. Not mounted on this host; auth uses clientid, merchantid, securitykey.',
        },
        {
          name: 'UniCommerce Marketplace Triggers',
          description:
            'Marketplace/webhook routes that optionally fire outbound UniCommerce calls when UNICOMMERCE_* env is configured.',
        },
        {
          name: 'UniCommerce Integration Catalog',
          description:
            'Full UniCommerce marketplace partner checklist vs StockConnect implementation. See openapi/integrationCatalog.openapi.js.',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          uniwareApiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'apiKey',
            description: 'Raw JWT from GET/POST /erp/unicommerce/authToken. Send as-is without a Bearer prefix.',
          },
          webhookAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Custom-Auth',
            description: 'Webhook shared-secret header for returns webhook ingress.',
          },
        },
        responses: {
          FailResponse: {
            description: 'Validation or business rule failure',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FailResponse' },
              },
            },
          },
        },
        schemas: {
          SuccessResponse: {
            type: 'object',
            properties: {
              error: { type: 'boolean', example: false },
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Success' },
              statusCode: { type: 'integer', example: 200 },
              data: { type: 'object', nullable: true },
            },
          },
          FailResponse: {
            type: 'object',
            properties: {
              error: { type: 'boolean', example: false },
              success: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Request failed' },
              statusCode: { type: 'integer', example: 400 },
              data: { type: 'object', nullable: true },
            },
          },
          ErrorResponse: {
            type: 'object',
            properties: {
              error: { type: 'boolean', example: true },
              success: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Internal error' },
              statusCode: { type: 'integer', example: 500 },
              data: { type: 'object', nullable: true },
            },
          },
          PaginationMeta: {
            type: 'object',
            properties: {
              totalElements: { type: 'integer', example: 42 },
              totalPages: { type: 'integer', example: 3 },
              page: { type: 'integer', example: 1 },
              size: { type: 'integer', example: 20 },
            },
          },
          ChannelEngineQueueJob: {
            type: 'object',
            properties: {
              _id: { type: 'string', example: '6a43a19ef80408a41d166b4c' },
              bullJobId: { type: 'string', example: '6a43a19ef80408a41d166b4c' },
              operationType: {
                type: 'string',
                enum: [
                  'PRODUCTS_PUSH',
                  'PRODUCTS_FREEZE',
                  'PRODUCTS_BULK_DELETE',
                  'PRODUCTS_EXTRA_DATA',
                  'OFFER_STOCK',
                  'OFFER_PRICE',
                  'ORDER_ACKNOWLEDGE',
                  'ORDER_CANCELLATION',
                  'SHIPMENT_CREATE',
                  'SHIPMENT_DELIVERY_STATE',
                  'RETURN_MERCHANT_CREATE',
                  'RETURN_MERCHANT_ACKNOWLEDGE',
                  'RETURN_ACCEPT_REJECT',
                ],
              },
              method: { type: 'string', example: 'PUT' },
              url: { type: 'string' },
              sellerId: { type: 'string', nullable: true },
              status: {
                type: 'string',
                enum: ['queued', 'active', 'retrying', 'completed', 'failed'],
              },
              requestBody: { type: 'object', nullable: true },
              responseBody: { type: 'object', nullable: true },
              rawResponse: { type: 'string', nullable: true },
              httpStatus: { type: 'integer', nullable: true },
              errorMessage: { type: 'string', nullable: true },
              errorDetails: { type: 'object', nullable: true },
              attemptCount: { type: 'integer' },
              maxAttempts: { type: 'integer' },
              metadata: { type: 'object' },
              batchId: { type: 'string', nullable: true },
              processedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          ChannelEngineQueueStats: {
            type: 'object',
            properties: {
              persisted: { type: 'object', additionalProperties: { type: 'integer' } },
              byOperation: { type: 'object', additionalProperties: { type: 'integer' } },
              liveQueue: { type: 'object' },
              rateLimit: {
                type: 'object',
                properties: {
                  maxRequests: { type: 'integer', example: 15 },
                  windowMinutes: { type: 'integer', example: 15 },
                },
              },
            },
          },
          ChannelEngineQueueListData: {
            type: 'object',
            properties: {
              content: {
                type: 'array',
                items: { $ref: '#/components/schemas/ChannelEngineQueueJob' },
              },
              pagination: { $ref: '#/components/schemas/PaginationMeta' },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    apis: [
      path.join(process.cwd(), 'src/routes/*.js'),
      path.join(process.cwd(), 'src/routes/**/*.js'),
      path.join(process.cwd(), 'src/integrations/**/*.js'),
    ],
  });

  applyUniCommerceSecurity(spec);
  return spec;
}

/** Inbound Uniware routes use apiKey; authToken is public. Outbound/trigger ops define their own security in JSDoc. */
function applyUniCommerceSecurity(spec) {
  for (const [routePath, operations] of Object.entries(spec.paths || {})) {
    if (!routePath.startsWith('/erp/unicommerce')) continue;

    for (const operation of Object.values(operations)) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) continue;

      if (routePath === '/erp/unicommerce/authToken') {
        operation.security = [];
      } else if (operation.security === undefined) {
        operation.security = [{ uniwareApiKey: [] }];
      }
    }
  }
}

/** Same spec as loadSwagger — UniCommerce docs live under /api-docs with the rest of Stock Connect. */
export function loadUniCommerceSwagger() {
  return loadSwagger();
}

/**
 * Clone spec and prepend the request host as the first server (dev/staging/prod Try it out).
 * Open Swagger at http://145.241.153.208/api-docs → server becomes http://145.241.153.208/api.
 */
export function withRequestServer(spec, req) {
  if (!req?.get) return spec;

  const host = req.get('host');
  if (!host) return spec;

  const protoHeader = req.get('x-forwarded-proto');
  const proto = protoHeader ? protoHeader.split(',')[0].trim() : req.protocol || 'http';
  const currentUrl = `${proto}://${host}/api`;

  const clone = structuredClone(spec);
  const rest = (clone.servers || []).filter((s) => s.url !== currentUrl);
  clone.servers = [{ url: currentUrl, description: 'Current host (use this on dev/staging/prod)' }, ...rest];
  return clone;
}
