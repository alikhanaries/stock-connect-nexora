import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCommerceProvider,
  resolveCommerceProviderId,
  resetCommerceProviderCache,
} from './commerceProviderFactory.js';

test('resolveCommerceProviderId resolves explicit channel-engine from env', () => {
  resetCommerceProviderCache();
  const id = resolveCommerceProviderId({ COMMERCE_PROVIDER: 'channel-engine' });
  assert.equal(id, 'channel-engine');
});

test('getCommerceProvider resolves ChannelEngine adapter when COMMERCE_PROVIDER=channel-engine', () => {
  resetCommerceProviderCache();
  const prev = process.env.COMMERCE_PROVIDER;
  process.env.COMMERCE_PROVIDER = 'channel-engine';
  try {
    const provider = getCommerceProvider();
    assert.equal(provider.id, 'channel-engine');
    assert.equal(typeof provider.fetchOrdersPage, 'function');
  } finally {
    process.env.COMMERCE_PROVIDER = prev;
    resetCommerceProviderCache();
  }
});

test('invalid COMMERCE_PROVIDER fails clearly', () => {
  resetCommerceProviderCache();
  assert.throws(() => resolveCommerceProviderId({ COMMERCE_PROVIDER: 'invalid' }), /Invalid COMMERCE_PROVIDER/);
});

test('COMMERCE_PROVIDER=nexora resolves Nexora adapter when configured', () => {
  resetCommerceProviderCache();
  const prev = {
    COMMERCE_PROVIDER: process.env.COMMERCE_PROVIDER,
    NEXORA_BASE_URL: process.env.NEXORA_BASE_URL,
    NEXORA_API_KEY: process.env.NEXORA_API_KEY,
  };
  process.env.COMMERCE_PROVIDER = 'nexora';
  process.env.NEXORA_BASE_URL = 'http://nexora.test';
  process.env.NEXORA_API_KEY = 'local-key';
  try {
    const provider = getCommerceProvider();
    assert.equal(provider.id, 'nexora');
  } finally {
    process.env.COMMERCE_PROVIDER = prev.COMMERCE_PROVIDER;
    process.env.NEXORA_BASE_URL = prev.NEXORA_BASE_URL;
    process.env.NEXORA_API_KEY = prev.NEXORA_API_KEY;
    resetCommerceProviderCache();
  }
});
