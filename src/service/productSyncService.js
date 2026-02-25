import mongoose from 'mongoose';
import UserChannelProducts from '#models/UserChannelProducts.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchChannelStatusMap({ channelId }) {
  const pageSize = 250;
  let page = 1;
  let total = Infinity;
  let retryCount = 0;

  const map = new Map();

  while ((page - 1) * pageSize < total) {
    const url =
      `${CHANNEL_ENGINE_BASE_URL}channels/${channelId}/products` +
      `?apiKey=${encodeURIComponent(CHANNEL_ENGINE_API_KEY)}` +
      `&page=${page}&pageSize=${pageSize}`;

    const res = await fetch(url);

    // Rate limit handling
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || 60);
      if (retryCount >= 3) {
        throw new Error('ChannelEngine rate limit exceeded. Max retries reached.');
      }
      retryCount++;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ChannelEngine failed ${res.status}: ${body}`);
    }

    retryCount = 0;

    const data = await res.json();
    const items = Array.isArray(data?.Content) ? data.Content : [];
    total = typeof data?.Count === 'number' ? data.Count : items.length;

    for (const item of items) {
      const sku = item?.MerchantProductNo;
      if (!sku) continue;
      map.set(String(sku), typeof item?.ChannelStatus === 'string' ? item.ChannelStatus : null);
    }

    page += 1;
  }

  return map;
}

export const syncProducts = async ({ sellerId, channel }) => {
  const channelId = Number(String(channel).trim());
  if (!Number.isInteger(channelId) || channelId <= 0) throw new Error(`Invalid channelId: ${channel}`);

  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const doc = await UserChannelProducts.findOne(
    { sellerId: sellerObjectId, channelId, isActive: true },
    { skuList: 1 }
  ).lean();

  const skuCodes = (doc?.skuList || [])
    .map((x) => x?.skuCode)
    .filter(Boolean)
    .map(String);

  if (!skuCodes.length) return { updated: 0, totalSku: 0 };

  const statusMap = await fetchChannelStatusMap({ channelId });

  const missingSkus = skuCodes.filter((sku) => !statusMap.has(sku));

  let updated = 0;
  const collection = UserChannelProducts.collection;
  const now = new Date();

  const ops = skuCodes.map((sku) => {
    const status = statusMap.has(sku) ? statusMap.get(sku) : null;

    return {
      updateOne: {
        filter: { sellerId: sellerObjectId, channelId, isActive: true },
        update: {
          $set: {
            'skuList.$[s].channelStatus': status,
            updatedAt: now,
          },
        },
        arrayFilters: [{ 's.skuCode': sku }],
      },
    };
  });

  if (ops.length) {
    const result = await collection.bulkWrite(ops, { ordered: false });
    updated += result?.modifiedCount || 0;
  }

  return { updated, totalSku: skuCodes.length, missingSkusCount: missingSkus.length };
};

export default { syncProducts };
