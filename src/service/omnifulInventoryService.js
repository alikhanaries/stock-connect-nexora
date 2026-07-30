import { config } from '#config/config.js';
import OmnifulWarehouseInventory from '#models/OmnifulWarehouseInventory.js';
import OmnifulInventorySyncLog from '#models/OmnifulInventorySyncLog.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { getReportToken } from '#service/forwardShipmentService.js';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_SYNC_LOOKBACK_DAYS = 365;

const formatOmnifulDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

const buildInventorySyncWindow = () => {
  const lookbackDays = Math.max(
    1,
    Number(process.env.OMNIFUL_INVENTORY_SYNC_LOOKBACK_DAYS) || DEFAULT_SYNC_LOOKBACK_DAYS
  );
  const updatedTo = new Date(Date.now() - 60 * 60 * 1000);
  const updatedFrom = new Date(updatedTo.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  return {
    updated_from: formatOmnifulDateTime(updatedFrom),
    updated_to: formatOmnifulDateTime(updatedTo),
    timezone: 'UTC',
  };
};

const pickString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const pickNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return 0;
};

const normalizeInventoryRow = (row = {}) => {
  const sku = pickString(row.sku_code, row.skuCode, row.sku, row.product_sku_code, row.productSkuCode);
  if (!sku) return null;

  return {
    sku,
    productName: pickString(row.name, row.product_name, row.productName, row.title, row.sku_name, row.skuName),
    quantity: pickNumber(
      row.available_quantity,
      row.availableQuantity,
      row.quantity_on_hand,
      row.quantity,
      row.available_qty,
      row.availableQty,
      row.stock,
      row.on_hand,
      row.onHand
    ),
  };
};

const extractInventoryBatch = (payload) => {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(normalizeInventoryRow).filter(Boolean);
  }

  if (Array.isArray(payload.items)) {
    return payload.items.map(normalizeInventoryRow).filter(Boolean);
  }

  if (Array.isArray(payload.skus)) {
    return payload.skus.map(normalizeInventoryRow).filter(Boolean);
  }

  if (Array.isArray(payload.inventory)) {
    return payload.inventory.map(normalizeInventoryRow).filter(Boolean);
  }

  const single = normalizeInventoryRow(payload);
  return single ? [single] : [];
};

const fetchInventoryPage = async (accessToken, hubCode, page, perPage, syncWindow) => {
  const baseUrl = config.OMNIFUL_API_URL;
  const query = new URLSearchParams({
    ...syncWindow,
    page: String(page),
    per_page: String(perPage),
  });

  const response = await fetch(
    `${baseUrl}/sales-channel/public/v1/seller/inventory/hubs/${encodeURIComponent(hubCode)}?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  );

  const body = await response.json();

  if (!response.ok || body?.is_success === false) {
    const message = body?.error?.message || body?.message || `Omniful inventory request failed (${response.status})`;
    throw new Error(message);
  }

  return {
    batch: extractInventoryBatch(body?.data),
    lastPage: Math.max(1, Number(body?.meta?.last_page) || 1),
  };
};

const fetchAllHubInventory = async (accessToken, hubCode) => {
  const syncWindow = buildInventorySyncWindow();
  const bySku = new Map();
  let page = 1;
  let lastPage = 1;

  while (page <= lastPage && page <= 200) {
    const { batch, lastPage: totalPages } = await fetchInventoryPage(
      accessToken,
      hubCode,
      page,
      DEFAULT_PAGE_SIZE,
      syncWindow
    );
    lastPage = totalPages;

    for (const row of batch) {
      bySku.set(row.sku, row);
    }

    page += 1;
  }

  return [...bySku.values()];
};

export const buildWarehouseAvailabilityFields = (skuCode, orderedQty, warehouseMap, lastSyncedAt) => {
  const row = warehouseMap[skuCode];
  const availableQty = row?.quantity || 0;
  const safeOrderedQty = Number(orderedQty) || 0;
  const canFulfill = availableQty > 0 && availableQty >= safeOrderedQty;

  return {
    expressWarehouseAvailableQty: availableQty,
    canFulfillFromWarehouse: canFulfill,
    availableInWarehouse: canFulfill,
    fulfillmentType: canFulfill ? 'EXPRESS_WAREHOUSE' : 'BRAND',
    inventoryLastSyncedAt: lastSyncedAt || row?.lastSyncedAt || null,
  };
};

export const getWarehouseAvailabilityContext = async (skuCodes = []) => {
  const hubCode = config.OMNIFUL_HUB_CODE;
  const uniqueSkus = [...new Set((skuCodes || []).filter(Boolean))];

  if (!uniqueSkus.length) {
    return { map: {}, lastSyncedAt: null };
  }

  const rows = await OmnifulWarehouseInventory.find({
    hubCode,
    sku: { $in: uniqueSkus },
  }).lean();

  const map = {};
  rows.forEach((row) => {
    map[row.sku] = row;
  });

  const latestLog = await OmnifulInventorySyncLog.findOne({ status: 'success' })
    .sort({ completedAt: -1 })
    .select('completedAt')
    .lean();

  return {
    map,
    lastSyncedAt: latestLog?.completedAt || null,
  };
};

export const syncOmnifulWarehouseInventory = async ({ trigger = 'manual' } = {}) => {
  const hubCode = config.OMNIFUL_HUB_CODE;

  if (!hubCode) {
    throw new Error('OMNIFUL_HUB_CODE is not configured');
  }

  const log = await OmnifulInventorySyncLog.create({
    status: 'running',
    trigger,
    hubCode,
    startedAt: new Date(),
  });

  try {
    const accessToken = await getReportToken();
    if (!accessToken) {
      throw new Error('Unable to obtain Omniful access token');
    }

    const rows = await fetchAllHubInventory(accessToken, hubCode);
    const syncedAt = new Date();
    const incomingSkus = new Set();

    if (rows.length) {
      const bulkOps = rows.map((row) => {
        incomingSkus.add(row.sku);
        return {
          updateOne: {
            filter: { sku: row.sku, hubCode },
            update: {
              $set: {
                sku: row.sku,
                productName: row.productName,
                quantity: row.quantity,
                hubCode,
                source: 'omniful',
                lastSyncedAt: syncedAt,
              },
            },
            upsert: true,
          },
        };
      });

      await OmnifulWarehouseInventory.bulkWrite(bulkOps, { ordered: false });
    }

    const staleRows = await OmnifulWarehouseInventory.find({
      hubCode,
      sku: { $nin: [...incomingSkus] },
    })
      .select('_id')
      .lean();

    let recordsRemoved = 0;
    if (staleRows.length) {
      const result = await OmnifulWarehouseInventory.deleteMany({
        hubCode,
        sku: { $nin: [...incomingSkus] },
      });
      recordsRemoved = result.deletedCount || 0;
    }

    await OmnifulInventorySyncLog.findByIdAndUpdate(log._id, {
      status: 'success',
      recordsSynced: rows.length,
      recordsRemoved,
      completedAt: new Date(),
    });

    return {
      success: true,
      hubCode,
      recordsSynced: rows.length,
      recordsRemoved,
      syncedAt,
    };
  } catch (error) {
    await OmnifulInventorySyncLog.findByIdAndUpdate(log._id, {
      status: 'failed',
      errorMessage: error.message,
      completedAt: new Date(),
    });
    throw error;
  }
};

export const getOmnifulWarehouseInventoryList = async (query = {}) => {
  const hubCode = config.OMNIFUL_HUB_CODE;
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.max(1, Number(query.size) || 10);
  const search = (query.search || '').trim();
  const filter = { hubCode };

  if (search) {
    filter.$or = [{ sku: { $regex: search, $options: 'i' } }, { productName: { $regex: search, $options: 'i' } }];
  }

  const [total, rows, latestLog] = await Promise.all([
    OmnifulWarehouseInventory.countDocuments(filter),
    OmnifulWarehouseInventory.find(filter)
      .sort({ sku: 1 })
      .skip((page - 1) * size)
      .limit(size)
      .lean(),
    OmnifulInventorySyncLog.findOne({ status: 'success' }).sort({ completedAt: -1 }).lean(),
  ]);

  return {
    content: rows.map((row) => ({
      sku: row.sku,
      productName: row.productName,
      quantity: row.quantity || 0,
      hubCode: row.hubCode,
      lastSyncedAt: row.lastSyncedAt,
    })),
    pagination: getPagination(total, page, size),
    lastSyncedAt: latestLog?.completedAt || null,
    hubCode,
  };
};

export const getOmnifulInventorySyncStatus = async () => {
  const latestSuccess = await OmnifulInventorySyncLog.findOne({ status: 'success' }).sort({ completedAt: -1 }).lean();
  const latestRun = await OmnifulInventorySyncLog.findOne().sort({ createdAt: -1 }).lean();
  const totalSkus = await OmnifulWarehouseInventory.countDocuments({ hubCode: config.OMNIFUL_HUB_CODE });

  return {
    hubCode: config.OMNIFUL_HUB_CODE,
    totalSkus,
    lastSuccessfulSync: latestSuccess
      ? {
          completedAt: latestSuccess.completedAt,
          recordsSynced: latestSuccess.recordsSynced,
          trigger: latestSuccess.trigger,
        }
      : null,
    lastRun: latestRun
      ? {
          status: latestRun.status,
          trigger: latestRun.trigger,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          recordsSynced: latestRun.recordsSynced,
          errorMessage: latestRun.errorMessage,
        }
      : null,
  };
};

export const getOmnifulInventorySyncLogs = async (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const logs = await OmnifulInventorySyncLog.find().sort({ createdAt: -1 }).limit(limit).lean();

  return logs.map((log) => ({
    id: log._id,
    status: log.status,
    trigger: log.trigger,
    hubCode: log.hubCode,
    recordsSynced: log.recordsSynced,
    recordsRemoved: log.recordsRemoved,
    errorMessage: log.errorMessage,
    startedAt: log.startedAt,
    completedAt: log.completedAt,
    createdAt: log.createdAt,
  }));
};

export default {
  syncOmnifulWarehouseInventory,
  getOmnifulWarehouseInventoryList,
  getOmnifulInventorySyncStatus,
  getOmnifulInventorySyncLogs,
  getWarehouseAvailabilityContext,
  buildWarehouseAvailabilityFields,
};
