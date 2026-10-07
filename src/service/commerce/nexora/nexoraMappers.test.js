import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapChannelEngineProductToNexoraCreate,
  mapChannelEngineShipmentToNexora,
  mapNexoraChannelsToChannelEngineContent,
  mapNexoraOrderLineToChannelEngineShape,
  mapNexoraOrderToChannelEngineShape,
  mapNexoraProductToChannelEngineShape,
  mapNexoraShipmentToChannelEngineShape,
  buildCePagedOrdersBody,
} from './nexoraMappers.js';

test('mapNexoraOrderLineToChannelEngineShape maps Nexora line fields to CE shape', () => {
  const line = mapNexoraOrderLineToChannelEngineShape({
    id: 'line-1',
    merchantSku: 'SKU-A',
    quantity: 2,
  });
  assert.equal(line.Id, 'line-1');
  assert.equal(line.MerchantProductNo, 'SKU-A');
  assert.equal(line.Quantity, 2);
});

test('mapNexoraOrderLineToChannelEngineShape preserves existing CE-compatible line fields', () => {
  const line = mapNexoraOrderLineToChannelEngineShape({
    Id: 'ce-line',
    MerchantProductNo: 'CE-SKU',
    Quantity: 5,
    UnitPriceInclVat: 10,
    ChannelOrderLineNo: '99',
  });
  assert.equal(line.Id, 'ce-line');
  assert.equal(line.MerchantProductNo, 'CE-SKU');
  assert.equal(line.Quantity, 5);
  assert.equal(line.UnitPriceInclVat, 10);
  assert.equal(line.ChannelOrderLineNo, '99');
});

test('mapNexoraOrderToChannelEngineShape maps top-level order fields and nested lines', () => {
  const mapped = mapNexoraOrderToChannelEngineShape({
    id: 'ord-1',
    orderNumber: '100',
    externalOrderReference: 'ext-100',
    status: 'NEW',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    lines: [{ id: 'l1', merchantSku: 'SKU-1', quantity: 1 }],
  });
  assert.equal(mapped.Id, 'ord-1');
  assert.equal(mapped.ChannelOrderNo, '100');
  assert.equal(mapped.MerchantOrderNo, 'ext-100');
  assert.equal(mapped.Status, 'NEW');
  assert.equal(mapped.CreatedAt, '2026-01-01T00:00:00Z');
  assert.equal(mapped.UpdatedAt, '2026-01-02T00:00:00Z');
  assert.equal(mapped.Lines.length, 1);
  assert.equal(mapped.Lines[0].MerchantProductNo, 'SKU-1');
  assert.equal(mapped.Lines[0].Quantity, 1);
});

test('buildCePagedOrdersBody maps order lines through line mapper', () => {
  const body = buildCePagedOrdersBody([{ id: 'ord-2', lines: [{ id: 'l2', merchantSku: 'SKU-2', quantity: 3 }] }], {
    totalCount: 1,
    page: 1,
    pageSize: 50,
    hasMore: false,
  });
  assert.equal(body.Content[0].Lines[0].Id, 'l2');
  assert.equal(body.Content[0].Lines[0].MerchantProductNo, 'SKU-2');
  assert.equal(body.Content[0].Lines[0].Quantity, 3);
});

test('mapNexoraProductToChannelEngineShape maps product identifiers and status', () => {
  const mapped = mapNexoraProductToChannelEngineShape({
    id: 'prod-1',
    merchantSku: 'SKU-P',
    externalReference: 'EXT-1',
    status: 'ACTIVE',
    inventorySummary: { available: 4 },
  });
  assert.equal(mapped.MerchantProductNo, 'SKU-P');
  assert.equal(mapped.Id, 'prod-1');
  assert.equal(mapped.ExternalReference, 'EXT-1');
  assert.equal(mapped.Status, 'ACTIVE');
  assert.deepEqual(mapped.inventorySummary, { available: 4 });
});

test('mapChannelEngineProductToNexoraCreate uses strict Nexora merchantSku body', () => {
  const body = mapChannelEngineProductToNexoraCreate({
    MerchantProductNo: 'SKU-1',
    Name: 'ignored',
    Price: 10,
  });
  assert.deepEqual(body, { merchantSku: 'SKU-1' });
});

test('mapNexoraChannelsToChannelEngineContent maps id/name/status fields', () => {
  const content = mapNexoraChannelsToChannelEngineContent([
    { id: 'ch-1', name: 'Noon', marketplaceId: 'noon', status: 'ACTIVE' },
  ]);
  assert.equal(content[0].Channels[0].ChannelId, 'ch-1');
  assert.equal(content[0].Channels[0].ChannelName, 'Noon');
  assert.equal(content[0].Channels[0].IsEnabled, true);
  assert.equal(content[0].GlobalChannelId, 'noon');
});

test('mapChannelEngineShipmentToNexora maps CE shipment payload to Nexora contract', () => {
  const body = mapChannelEngineShipmentToNexora('ord-1', {
    Lines: [{ OrderLineId: '11111111-1111-4111-8111-111111111111', Quantity: 2 }],
    Method: 'DHL',
    TrackTraceNo: 'TRACK-1',
  });
  assert.deepEqual(body.lines, [{ orderLineId: '11111111-1111-4111-8111-111111111111', quantity: 2 }]);
  assert.equal(body.carrier, 'DHL');
  assert.equal(body.trackingNumber, 'TRACK-1');
});

test('mapNexoraShipmentToChannelEngineShape maps Nexora shipment response fields', () => {
  const mapped = mapNexoraShipmentToChannelEngineShape({
    id: 'ship-9',
    status: 'SHIPPED',
    trackingNumber: 'TN-123',
  });
  assert.equal(mapped.Id, 'ship-9');
  assert.equal(mapped.MerchantShipmentNo, 'ship-9');
  assert.equal(mapped.Status, 'SHIPPED');
  assert.equal(mapped.TrackTraceNo, 'TN-123');
});
