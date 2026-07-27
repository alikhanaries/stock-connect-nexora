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
        description: 'UniCommerce ERP Integration APIs',
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
