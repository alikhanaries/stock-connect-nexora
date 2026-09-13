import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { config } from '#config/config.js';

export function loadSwagger() {
  return swaggerJsdoc({
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
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
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
}

export function loadUniCommerceSwagger() {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Stock Connect UniCommerce API',
        description:
          'UniCommerce ERP Integration APIs (inbound Uniware → StockConnect including Post Status Notification, and outbound Post Cancel to UC).',
        version: '1.0.0',
      },
      servers: [{ url: `${config.BASE_URL}api` }, { url: 'http://localhost:8000/api' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
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
        },
      },
    },
    apis: [path.join(process.cwd(), 'src/integrations/erp/unicommerce/**/*.js')],
  });
}
