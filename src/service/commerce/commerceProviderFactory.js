import { config } from '#config/config.js';
import { COMMERCE_PROVIDER_IDS, DEFAULT_COMMERCE_PROVIDER } from '#constants/commerceProvider.js';
import { ChannelEngineCommerceProvider } from './channelEngineCommerceProvider.js';
import { NexoraCommerceProvider } from './nexoraCommerceProvider.js';

let cachedProvider = null;
let cachedProviderId = null;

export function resolveCommerceProviderId(env = process.env) {
  const raw = (env.COMMERCE_PROVIDER ?? config.COMMERCE_PROVIDER ?? DEFAULT_COMMERCE_PROVIDER).trim().toLowerCase();
  if (!COMMERCE_PROVIDER_IDS.includes(raw)) {
    throw new Error(`Invalid COMMERCE_PROVIDER: "${raw}". Accepted values: ${COMMERCE_PROVIDER_IDS.join(', ')}`);
  }
  return raw;
}

function assertNexoraConfiguration() {
  const baseUrl = (process.env.NEXORA_BASE_URL || config.NEXORA_BASE_URL || '').trim();
  const apiKey = (process.env.NEXORA_API_KEY || config.NEXORA_API_KEY || '').trim();
  if (!baseUrl) {
    throw new Error('NEXORA_BASE_URL is required when COMMERCE_PROVIDER=nexora');
  }
  if (!apiKey) {
    throw new Error('NEXORA_API_KEY is required when COMMERCE_PROVIDER=nexora');
  }
}

function createCommerceProvider(providerId) {
  switch (providerId) {
    case 'channel-engine':
      return new ChannelEngineCommerceProvider();
    case 'nexora':
      assertNexoraConfiguration();
      return new NexoraCommerceProvider();
    default:
      throw new Error(
        `Invalid COMMERCE_PROVIDER: "${providerId}". Accepted values: ${COMMERCE_PROVIDER_IDS.join(', ')}`
      );
  }
}

export function getCommerceProvider() {
  const providerId = resolveCommerceProviderId();
  if (!cachedProvider || cachedProviderId !== providerId) {
    cachedProvider = createCommerceProvider(providerId);
    cachedProviderId = providerId;
  }
  return cachedProvider;
}

/** @internal test helper */
export function resetCommerceProviderCache() {
  cachedProvider = null;
  cachedProviderId = null;
}
