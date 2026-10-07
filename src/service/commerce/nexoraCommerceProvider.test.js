import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { NexoraCommerceProvider } from './nexoraCommerceProvider.js';
import { CommerceProviderError } from './CommerceProviderError.js';

const NEXORA_BASE = 'http://nexora.test';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupEnv() {
  process.env.NEXORA_BASE_URL = NEXORA_BASE;
  process.env.NEXORA_API_KEY = 'my-secret';
  process.env.NEXORA_REQUEST_TIMEOUT_MS = '5000';
}

test('Nexora requests use NEXORA_BASE_URL and Bearer nxk_ credential', async () => {
  setupEnv();
  const fetchMock = mock.method(global, 'fetch', async (url, init) => {
    assert.match(String(url), /^http:\/\/nexora\.test\/api\/v2\/stock-connect\/ping$/);
    assert.match(init.headers.Authorization, /^Bearer nxk_my-secret$/);
    return jsonResponse(200, { success: true, integration: 'stock-connect', data: { ok: true } });
  });

  const provider = new NexoraCommerceProvider();
  await provider.ping();
  fetchMock.mock.restore();
});

test('fetchOrdersPage normalizes Nexora list envelope to CE pagination shape', async () => {
  setupEnv();
  mock.method(global, 'fetch', async () =>
    jsonResponse(200, {
      success: true,
      integration: 'stock-connect',
      data: {
        items: [
          {
            id: 'ord-1',
            orderNumber: 'M-1',
            status: 'NEW',
            lines: [{ id: 'line-1', merchantSku: 'SKU-9', quantity: 2 }],
          },
        ],
        hasMore: false,
        totalCount: 1,
      },
    })
  );

  const provider = new NexoraCommerceProvider();
  const res = await provider.fetchOrdersPage(1, 100);
  const body = await res.json();
  assert.equal(body.Content.length, 1);
  assert.equal(body.Content[0].Id, 'ord-1');
  assert.equal(body.Content[0].Lines[0].MerchantProductNo, 'SKU-9');
  assert.equal(body.Content[0].Lines[0].Quantity, 2);
  assert.equal(body.TotalCount, 1);
  assert.equal(body.ItemsPerPage, 100);
  mock.restoreAll();
});

test('postOrderCancellation maps to Nexora cancel endpoint', async () => {
  setupEnv();
  const calls = [];
  mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    return jsonResponse(200, {
      success: true,
      integration: 'stock-connect',
      data: { canceled: true },
    });
  });

  const provider = new NexoraCommerceProvider();
  const res = await provider.postOrderCancellation({ OrderId: 'ord-9', Reason: 'test' });
  assert.equal(res.ok, true);
  assert.match(calls[0].url, /\/orders\/ord-9\/cancel$/);
  mock.restoreAll();
});

test('putOfferStock maps CE absolute stock to Nexora inventory delta adjustment', async () => {
  setupEnv();
  process.env.NEXORA_STOCK_LOCATION_ID = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  mock.method(global, 'fetch', async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('/products?')) {
      return jsonResponse(200, {
        success: true,
        integration: 'stock-connect',
        data: { items: [{ id: '22222222-2222-4222-8222-222222222222', merchantSku: 'SKU-1' }] },
      });
    }
    if (String(url).includes('/inventory/')) {
      return jsonResponse(200, {
        success: true,
        integration: 'stock-connect',
        data: { productId: '22222222-2222-4222-8222-222222222222', balances: [{ available: 1 }] },
      });
    }
    if (String(url).includes('/inventory/adjustments')) {
      const capturedBody = JSON.parse(init.body);
      assert.equal(capturedBody.productId, '22222222-2222-4222-8222-222222222222');
      assert.equal(capturedBody.quantityDelta, 3);
      return jsonResponse(200, { success: true, integration: 'stock-connect', data: {} });
    }
    return jsonResponse(200, { success: true, integration: 'stock-connect', data: {} });
  });

  const provider = new NexoraCommerceProvider();
  await provider.putOfferStock([{ MerchantProductNo: 'SKU-1', StockLocations: [{ Stock: 4 }] }], {
    awaitResult: true,
  });
  assert.ok(calls.some((u) => u.includes('merchantSku=SKU-1')));
  mock.restoreAll();
});

test('fetchChannels maps Nexora channels to CE Content shape', async () => {
  setupEnv();
  mock.method(global, 'fetch', async () =>
    jsonResponse(200, {
      success: true,
      integration: 'stock-connect',
      data: {
        items: [{ id: 7, name: 'Noon', enabled: true, countryCode: 'SA' }],
      },
    })
  );

  const provider = new NexoraCommerceProvider();
  const res = await provider.fetchChannels();
  const body = await res.json();
  assert.ok(Array.isArray(body.Content));
  assert.equal(body.Content[0].Channels[0].ChannelId, 7);
  mock.restoreAll();
});

test('unsupported operations throw CommerceProviderError with UNSUPPORTED_OPERATION', () => {
  setupEnv();
  const provider = new NexoraCommerceProvider();
  assert.throws(
    () => provider.fetchOrderInvoice('x'),
    (err) => {
      assert.ok(err instanceof CommerceProviderError);
      assert.equal(err.provider, 'nexora');
      assert.equal(err.externalCode, 'UNSUPPORTED_OPERATION');
      return true;
    }
  );
});

test('401 responses map to AUTHENTICATION_ERROR', async () => {
  setupEnv();
  mock.method(global, 'fetch', async () =>
    jsonResponse(401, { success: false, integration: 'stock-connect', message: 'Unauthorized' })
  );

  const provider = new NexoraCommerceProvider();
  await assert.rejects(
    () => provider.fetchChannels(),
    (err) => {
      assert.equal(err.externalCode, 'AUTHENTICATION_ERROR');
      return true;
    }
  );
  mock.restoreAll();
});

test('network failures map to NETWORK_ERROR', async () => {
  setupEnv();
  mock.method(global, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });

  const provider = new NexoraCommerceProvider();
  await assert.rejects(
    () => provider.fetchChannels(),
    (err) => {
      assert.equal(err.externalCode, 'NETWORK_ERROR');
      return true;
    }
  );
  mock.restoreAll();
});

test('postShipment uses POST orders shipments endpoint and maps response data', async () => {
  setupEnv();
  const calls = [];
  mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return jsonResponse(201, {
      success: true,
      integration: 'stock-connect',
      data: { id: 'ship-1', status: 'CREATED', trackingNumber: 'AWB-1' },
    });
  });

  const provider = new NexoraCommerceProvider();
  const orderLineId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const res = await provider.postShipment({
    orderId: 'ord-55',
    Lines: [{ OrderLineId: orderLineId, Quantity: 1 }],
    Method: 'Aramex',
    TrackTraceNo: 'AWB-1',
  });

  assert.equal(res.ok, true);
  assert.equal(res.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/orders\/ord-55\/shipments$/);
  assert.deepEqual(calls[0].body.lines, [{ orderLineId, quantity: 1 }]);
  assert.equal(res.data.Id, 'ship-1');
  assert.equal(res.data.TrackTraceNo, 'AWB-1');
  assert.equal(res.data.MerchantShipmentNo, 'ship-1');
  mock.restoreAll();
});

test('postShipment normalizes HTTP errors', async () => {
  setupEnv();
  mock.method(global, 'fetch', async () =>
    jsonResponse(404, {
      success: false,
      integration: 'stock-connect',
      message: 'Order not found',
    })
  );

  const provider = new NexoraCommerceProvider();
  await assert.rejects(
    () =>
      provider.postShipment({
        orderId: 'missing',
        Lines: [{ OrderLineId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Quantity: 1 }],
      }),
    (err) => {
      assert.equal(err.externalCode, 'NOT_FOUND');
      return true;
    }
  );
  mock.restoreAll();
});

test('putShipmentDeliveryState uses POST shipments ship endpoint and maps response', async () => {
  setupEnv();
  const calls = [];
  mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return jsonResponse(200, {
      success: true,
      integration: 'stock-connect',
      data: { id: 'ship-2', status: 'SHIPPED', trackingNumber: 'TN-2' },
    });
  });

  const provider = new NexoraCommerceProvider();
  const res = await provider.putShipmentDeliveryState('ship-2', {
    Status: 'SHIPPED',
    DeliveredAt: '2026-01-01T12:00:00Z',
  });

  assert.equal(res.ok, true);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/shipments\/ship-2\/ship$/);
  assert.equal(calls[0].body.status, 'SHIPPED');
  assert.equal(calls[0].body.deliveredAt, '2026-01-01T12:00:00Z');
  assert.equal(res.data.Status, 'SHIPPED');
  assert.equal(res.data.TrackTraceNo, 'TN-2');
  mock.restoreAll();
});

test('timeout maps to TIMEOUT', async () => {
  setupEnv();
  process.env.NEXORA_REQUEST_TIMEOUT_MS = '10';
  mock.method(global, 'fetch', async (_url, init) => {
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    });
  });

  const provider = new NexoraCommerceProvider();
  await assert.rejects(
    () => provider.fetchChannels(),
    (err) => {
      assert.equal(err.externalCode, 'TIMEOUT');
      return true;
    }
  );
  mock.restoreAll();
});
