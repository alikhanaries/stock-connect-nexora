import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatUniwareChannelProductId } from '../helpers/buildUniwareChannelProductId.js';
import {
  buildCourierReturnGroupKey,
  buildCourierReturnId,
  groupPendingCourierReturns,
} from '../helpers/courierReturnGrouping.js';
import { formatUniwareReturnCreatedOn } from './uniwareReturnService.js';

describe('formatUniwareChannelProductId', () => {
  it('builds ProductId-VariantId using the same parent id map as Get Products', () => {
    const productIdBySku = new Map([['SKU-RED-M', '679a1b2c3d4e5f6789012345']]);

    assert.equal(formatUniwareChannelProductId(productIdBySku, 'SKU-RED-M'), '679a1b2c3d4e5f6789012345-SKU-RED-M');
  });

  it('returns null when parent product id cannot be resolved', () => {
    const productIdBySku = new Map();

    assert.equal(formatUniwareChannelProductId(productIdBySku, 'SKU-RED-M'), null);
    assert.equal(formatUniwareChannelProductId(productIdBySku, ''), null);
  });
});

describe('formatUniwareReturnCreatedOn', () => {
  it('formats timestamp as YYYY-MM-DD HH:mm:ss', () => {
    assert.equal(formatUniwareReturnCreatedOn(new Date('2026-09-08T16:35:00+05:00')), '2026-09-08 16:35:00');
  });

  it('falls back to current time for invalid dates', () => {
    const formatted = formatUniwareReturnCreatedOn('not-a-date');
    assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('buildCourierReturnId', () => {
  it('uses orderId and AWB when AWB is available', () => {
    assert.equal(buildCourierReturnId({ orderId: '987654', airWaybillNo: 'AWB123' }), 'RTO-987654-AWB123');
  });

  it('falls back to orderId only when AWB is missing', () => {
    assert.equal(buildCourierReturnId({ orderId: '987654', airWaybillNo: '' }), 'RTO-987654');
    assert.equal(buildCourierReturnId({ orderId: '987654' }), 'RTO-987654');
  });
});

describe('groupPendingCourierReturns', () => {
  it('merges lines from the same order, seller, and AWB into one group', () => {
    const groups = groupPendingCourierReturns([
      {
        orderId: '987654',
        channelOrderNo: 'MP-ORD-1',
        sellerId: 'seller-a',
        airWaybillNo: 'AWB123',
        orderLineId: 10,
        merchantProductNo: 'SKU-A',
        quantity: 1,
      },
      {
        orderId: '987654',
        channelOrderNo: 'MP-ORD-1',
        sellerId: 'seller-a',
        airWaybillNo: 'AWB123',
        orderLineId: 11,
        merchantProductNo: 'SKU-B',
        quantity: 2,
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].airWaybillNo, 'AWB123');
    assert.equal(groups[0].lines.length, 2);
    assert.equal(buildCourierReturnGroupKey(groups[0]), '987654|seller-a|AWB123');
  });

  it('splits groups by AWB and seller', () => {
    const groups = groupPendingCourierReturns([
      {
        orderId: '987654',
        sellerId: 'seller-a',
        airWaybillNo: 'AWB123',
        orderLineId: 10,
        merchantProductNo: 'SKU-A',
        quantity: 1,
      },
      {
        orderId: '987654',
        sellerId: 'seller-a',
        airWaybillNo: 'AWB999',
        orderLineId: 11,
        merchantProductNo: 'SKU-B',
        quantity: 1,
      },
      {
        orderId: '987654',
        sellerId: 'seller-b',
        airWaybillNo: 'AWB123',
        orderLineId: 12,
        merchantProductNo: 'SKU-C',
        quantity: 1,
      },
    ]);

    assert.equal(groups.length, 3);
  });

  it('groups missing AWB lines under the same order and seller bucket', () => {
    const groups = groupPendingCourierReturns([
      {
        orderId: '987654',
        sellerId: 'seller-a',
        airWaybillNo: '',
        orderLineId: 10,
        merchantProductNo: 'SKU-A',
        quantity: 1,
      },
      {
        orderId: '987654',
        sellerId: 'seller-a',
        orderLineId: 11,
        merchantProductNo: 'SKU-B',
        quantity: 1,
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(buildCourierReturnId({ orderId: '987654', airWaybillNo: '' }), 'RTO-987654');
    assert.equal(groups[0].lines.length, 2);
  });
});

describe('Uniware return payload contract', () => {
  it('uses channelProductId as ProductId-VariantId, not channelProductNo fallback', () => {
    const productIdBySku = new Map([['VARIANT-SKU', 'parentMongoId123']]);
    const channelProductId = formatUniwareChannelProductId(productIdBySku, 'VARIANT-SKU');

    assert.equal(channelProductId, 'parentMongoId123-VARIANT-SKU');
    assert.notEqual(channelProductId, 'channelProductNo');
    assert.notEqual(channelProductId, 'VARIANT-SKU');
  });
});
