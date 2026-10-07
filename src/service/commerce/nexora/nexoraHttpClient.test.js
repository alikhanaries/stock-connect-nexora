import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { nexoraRequest } from './nexoraHttpClient.js';
import { CommerceProviderError } from '../CommerceProviderError.js';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupEnv() {
  process.env.NEXORA_BASE_URL = 'http://nexora.test';
  process.env.NEXORA_API_KEY = 'test-key';
  process.env.NEXORA_REQUEST_TIMEOUT_MS = '5000';
}

const statusCases = [
  [400, 'HTTP_ERROR'],
  [403, 'AUTHENTICATION_ERROR'],
  [404, 'NOT_FOUND'],
  [409, 'CONFLICT'],
  [422, 'VALIDATION_ERROR'],
  [429, 'HTTP_ERROR'],
  [500, 'UPSTREAM_ERROR'],
];

for (const [status, expectedCode] of statusCases) {
  test(`HTTP ${status} maps to ${expectedCode}`, async () => {
    setupEnv();
    mock.method(global, 'fetch', async () =>
      jsonResponse(status, {
        success: false,
        integration: 'stock-connect',
        message: `error-${status}`,
      })
    );

    await assert.rejects(
      () => nexoraRequest('GET', '/channels', { operation: 'testHttpError' }),
      (err) => {
        assert.ok(err instanceof CommerceProviderError);
        assert.equal(err.externalCode, expectedCode);
        assert.equal(err.status, status);
        assert.ok(!String(err.message).includes('test-key'));
        assert.ok(!String(err.message).includes('nxk_'));
        return true;
      }
    );
    mock.restoreAll();
  });
}
