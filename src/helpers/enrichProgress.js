import { getProgress } from '#helpers/geminiTranslate.js';
import { getCategoryMapProgress } from '#helpers/geminiCategoryMap.js';
import { buildTranslateLabel, CATEGORY_MAP_LABEL } from '#helpers/operationLabels.js';

export const PROGRESS_TYPES = ['ai-enrich'];

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
  };
  if (categoryMap.retryInfo) out.retryInfo = categoryMap.retryInfo;
  if (categoryMap.error) out.error = categoryMap.error;
  return out;
};

const pickActiveMessage = (operations, { doneMessage, errorMessage }) => {
  const errored = operations.find((o) => o.status === 'error');
  if (errored) return `${errorMessage}: ${errored.label}`;

  const active = operations.find((o) => o.status !== 'done');
  if (active) return active.label;

  if (operations.length && operations.every((o) => o.status === 'done')) return doneMessage;

  return errorMessage.replace(/failed$/i, 'starting');
};

const buildAiEnrichBlock = (sellerId) => {
  const translate = getProgress(sellerId);
  const categoryMap = getCategoryMapProgress(sellerId);
  if (!translate && !categoryMap) return null;

  const translateOps = decorateTranslateOps(translate);
  const categoryMapOp = decorateCategoryMapOp(categoryMap);
  const operations = [...translateOps, ...(categoryMapOp ? [categoryMapOp] : [])];

  const hasError = operations.some((o) => o.status === 'error');
  const allDone = operations.length > 0 && operations.every((o) => o.status === 'done');
  const anyRunning = operations.some((o) => o.status === 'running');
  const status = hasError ? 'error' : allDone ? 'done' : anyRunning ? 'running' : 'initializing';

  const totalProducts = translate?.totalProducts ?? categoryMap?.total ?? 0;
  const updatedProducts = Math.max(translate?.updatedProducts ?? 0, categoryMap?.updated ?? 0);
  const totalOperations = operations.length;
  const completedOperations = operations.filter((o) => o.status === 'done').length;
  const totalPercentage = totalOperations
    ? Math.round(operations.reduce((sum, o) => sum + (o.percentage || 0), 0) / totalOperations)
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

const buildSyncBlock = () => ({});

export const BLOCK_BUILDERS = {
  'ai-enrich': buildAiEnrichBlock,
  sync: buildSyncBlock,
};

export const aggregateStatus = (blocks) => {
  const statuses = blocks.map((b) => b?.status).filter(Boolean);
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.length && statuses.every((s) => s === 'done')) return 'done';
  if (statuses.some((s) => s === 'running')) return 'running';
  return 'initializing';
};

export const aggregateMessage = (blocks, locale) => {
  const operations = blocks.flatMap((b) => b?.operations ?? []);
  return pickActiveMessage(operations, {
    doneMessage: locale.ENRICHMENT_COMPLETED,
    errorMessage: locale.ENRICHMENT_FAILED,
  });
};
