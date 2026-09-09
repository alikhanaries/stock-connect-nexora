import { getProgress } from '#helpers/geminiTranslate.js';
import { getCategoryMapProgress } from '#helpers/geminiCategoryMap.js';
import { getValidateFieldProgress } from '#helpers/geminiValidateField.js';
import { buildTranslateLabel, CATEGORY_MAP_LABEL, buildValidateFieldLabel } from '#helpers/operationLabels.js';
import { VALIDATE_FIELDS } from '#constants/validateField.js';
import { getSyncProgress } from '#helpers/syncProgress.js';

export const PROGRESS_TYPES = ['ai-enrich', 'sync'];
const PAUSABLE_STATUSES = new Set(['pending', 'running', 'initializing']);
const RETRIABLE_STATUSES = new Set(['error', 'cancelled', 'paused', 'done']);

const decorateTranslateOps = (translate) =>
  (translate?.operations || []).map((o) => {
    const out = {
      field: o.field,
      lang: o.lang,
      total: o.total,
      completed: o.completed,
      status: o.status,
      percentage: o.percentage,
      label: buildTranslateLabel(o.field, o.lang),
      canPause: PAUSABLE_STATUSES.has(o.status),
      canResume: o.status === 'paused',
      canRetry: RETRIABLE_STATUSES.has(o.status),
    };
    if (o.retryInfo) out.retryInfo = o.retryInfo;
    if (o.error) out.error = o.error;
    return out;
  });

const decorateCategoryMapOp = (categoryMap) => {
  if (!categoryMap) return null;
  const status = categoryMap.status === 'initializing' ? 'pending' : categoryMap.status;
  const out = {
    label: CATEGORY_MAP_LABEL,
    field: 'categoryTrail',
    status,
    total: categoryMap.total,
    completed: categoryMap.completed,
    updated: categoryMap.updated,
    percentage: categoryMap.percentage,
    canPause: PAUSABLE_STATUSES.has(status),
    canResume: status === 'paused',
    canRetry: RETRIABLE_STATUSES.has(status),
  };
  if (categoryMap.retryInfo) out.retryInfo = categoryMap.retryInfo;
  if (categoryMap.error) out.error = categoryMap.error;
  return out;
};

const decorateValidateFieldOp = (validate) => {
  if (!validate) return null;
  const status = validate.status === 'initializing' ? 'pending' : validate.status;
  const out = {
    label: buildValidateFieldLabel(validate.field),
    field: validate.field,
    status,
    total: validate.total,
    completed: validate.completed,
    updated: validate.updated,
    percentage: validate.percentage,
    canPause: PAUSABLE_STATUSES.has(status),
    canResume: status === 'paused',
    canRetry: RETRIABLE_STATUSES.has(status),
  };
  if (validate.retryInfo) out.retryInfo = validate.retryInfo;
  if (validate.error) out.error = validate.error;
  return out;
};

const pickActiveMessage = (operations, { doneMessage, errorMessage, cancelledMessage, pausedMessage }) => {
  if (!operations.length) return doneMessage;

  const errored = operations.find((o) => o.status === 'error');
  if (errored) return `${errorMessage}: ${errored.label}`;

  const active = operations.find((o) => !['done', 'cancelled', 'paused'].includes(o.status));
  if (active) return active.label;
  if (operations.some((o) => o.status === 'paused')) return pausedMessage;

  if (operations.every((o) => o.status === 'cancelled')) return cancelledMessage;

  return doneMessage;
};

const buildAiEnrichBlock = (sellerId) => {
  const translate = getProgress(sellerId);
  const categoryMap = getCategoryMapProgress(sellerId);
  const validateOps = VALIDATE_FIELDS.map((f) => decorateValidateFieldOp(getValidateFieldProgress(sellerId, f))).filter(
    Boolean
  );
  if (!translate && !categoryMap && !validateOps.length) return null;

  const translateOps = decorateTranslateOps(translate);
  const categoryMapOp = decorateCategoryMapOp(categoryMap);
  const operations = [...translateOps, ...(categoryMapOp ? [categoryMapOp] : []), ...validateOps];

  const hasError = operations.some((o) => o.status === 'error');
  const anyRunning = operations.some((o) => o.status === 'running');
  const anyPaused = operations.some((o) => o.status === 'paused');
  const settledOps = operations.filter((o) => o.status !== 'cancelled' && o.status !== 'paused');
  const allSettledDone = settledOps.length > 0 && settledOps.every((o) => o.status === 'done');
  const allCancelled = operations.length > 0 && operations.every((o) => o.status === 'cancelled');
  const status = hasError
    ? 'error'
    : anyRunning
      ? 'running'
      : anyPaused
        ? 'paused'
        : allSettledDone
          ? 'done'
          : allCancelled
            ? 'cancelled'
            : 'initializing';

  const totalProducts = translate?.totalProducts ?? categoryMap?.total ?? validateOps.find((o) => o.total)?.total ?? 0;
  const updatedProducts = operations.reduce((max, o) => Math.max(max, o.completed ?? 0), 0);
  const totalOperations = operations.length;
  const completedOperations = operations.filter((o) => o.status === 'done').length;
  const totalPercentage = settledOps.length
    ? Math.round(settledOps.reduce((sum, o) => sum + (o.percentage || 0), 0) / settledOps.length)
    : 0;

  return {
    status,
    totalProducts,
    updatedProducts,
    totalOperations,
    totalPercentage,
    completedOperations,
    operations,
  };
};

const buildSyncBlock = (sellerId) => getSyncProgress(sellerId);

export const BLOCK_BUILDERS = {
  'ai-enrich': buildAiEnrichBlock,
  sync: buildSyncBlock,
};

export const aggregateStatus = (blocks) => {
  const statuses = blocks.map((b) => b?.status).filter(Boolean);
  if (!statuses.length) return 'done';
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.some((s) => s === 'running')) return 'running';
  if (statuses.some((s) => s === 'paused')) return 'paused';
  if (statuses.every((s) => s === 'done' || s === 'cancelled')) {
    return statuses.some((s) => s === 'done') ? 'done' : 'cancelled';
  }
  return 'initializing';
};

export const aggregateMessage = (blocks, locale) => {
  const operations = blocks.flatMap((b) => b?.operations ?? []);
  return pickActiveMessage(operations, {
    doneMessage: locale.ENRICHMENT_COMPLETED,
    errorMessage: locale.ENRICHMENT_FAILED,
    cancelledMessage: locale.ENRICHMENT_CANCELLED,
    pausedMessage: locale.ENRICHMENT_PAUSED,
  });
};
