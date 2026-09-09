const progressStore = new Map();

const key = (sellerId) => String(sellerId ?? '');

const errorMessage = (error) => {
  if (!error) return 'Sync failed';
  if (typeof error === 'string') return error;
  return error.message || 'Sync failed';
};

export const getSyncProgress = (sellerId) => {
  const progress = progressStore.get(key(sellerId));
  return progress ? { ...progress, operations: progress.operations.map((op) => ({ ...op })) } : null;
};

export const startSyncJob = (sellerId, { label = 'Syncing', field = 'sync' } = {}) => {
  progressStore.set(key(sellerId), {
    status: 'running',
    totalProducts: 0,
    updatedProducts: 0,
    totalOperations: 1,
    completedOperations: 0,
    totalPercentage: 0,
    operations: [
      {
        label,
        field,
        status: 'running',
        total: 0,
        completed: 0,
        percentage: 0,
      },
    ],
  });
};

export const updateSyncJob = (sellerId, { completed, total, percentage, label } = {}) => {
  const progress = progressStore.get(key(sellerId));
  if (!progress) return;
  const op = progress.operations[0];
  if (!op) return;
  if (typeof total === 'number') op.total = total;
  if (typeof completed === 'number') op.completed = completed;
  if (typeof percentage === 'number') {
    op.percentage = Math.max(0, Math.min(100, Math.round(percentage)));
  } else if (op.total > 0) {
    op.percentage = Math.round(((op.completed ?? 0) / op.total) * 100);
  }
  if (label) op.label = label;
  progress.totalProducts = op.total ?? 0;
  progress.updatedProducts = op.completed ?? 0;
  progress.totalPercentage = op.percentage ?? 0;
};

export const completeSyncJob = (sellerId, result = {}) => {
  const progress = progressStore.get(key(sellerId));
  if (!progress) return;
  const completed =
    result.updated ??
    result.upsertedCount ??
    result.processed ??
    result.updatedProducts ??
    progress.updatedProducts ??
    0;
  const total = result.total ?? result.totalSku ?? result.totalProducts ?? completed;
  progress.status = 'done';
  progress.totalPercentage = 100;
  progress.completedOperations = progress.totalOperations;
  progress.updatedProducts = completed;
  progress.totalProducts = total || completed;
  progress.operations = progress.operations.map((op) => ({
    ...op,
    status: 'done',
    percentage: 100,
    completed: completed || op.completed,
    total: total || op.total,
    updated: completed,
  }));
};

export const failSyncJob = (sellerId, error) => {
  let progress = progressStore.get(key(sellerId));
  if (!progress) {
    startSyncJob(sellerId, { label: 'Sync' });
    progress = progressStore.get(key(sellerId));
  }
  const message = errorMessage(error);
  progress.status = 'error';
  progress.operations = progress.operations.map((op) => ({
    ...op,
    status: 'error',
    error: { message },
  }));
};

export const trackBackgroundSync = (sellerId, work, { label = 'Syncing', field = 'sync' } = {}) => {
  startSyncJob(sellerId, { label, field });
  setImmediate(async () => {
    try {
      const result = await work();
      completeSyncJob(sellerId, result);
    } catch (error) {
      console.error(`[sync:${field}] Background sync failed:`, error);
      failSyncJob(sellerId, error);
    }
  });
};
