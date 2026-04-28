import mongoose from 'mongoose';
import { Readable } from 'stream';
import FinanceRecord from '#models/FinanceRecord.js';
import { getDateRange } from '#helpers/dashboard.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { convertGoogleSheetUrlToExport, isValidGoogleSheetUrl } from '#helpers/googleSheetFormaterHandler.js';
import { mapRowToRecord, parseSheetStream } from '#helpers/financeSheetHandler.js';

export const getTransactionHistory = async (
  sellerIds,
  { period, month, startDate, endDate, channel, search, page = 1, size = 10 } = {}
) => {
  const parsedLimit = Math.max(parseInt(size) || 10, 1);

  const ids = Array.isArray(sellerIds) ? sellerIds : [sellerIds];
  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const match = { sellerId: { $in: sellerObjectIds } };
  console.log('[getTransactionHistory] querying sellerIds:', sellerObjectIds.map(String));
  console.log('[getTransactionHistory] total docs in collection:', await FinanceRecord.countDocuments({}));
  const sampleDoc = await FinanceRecord.findOne({}).lean();
  console.log('[getTransactionHistory] sample doc sellerId in DB:', sampleDoc?.sellerId, typeof sampleDoc?.sellerId);

  const range = getDateRange({ period, startDate, endDate, month });
  if (range) {
    match.orderDate = { $gte: range.start, $lte: range.end };
  }

  const marketplaces = channel
    ? String(channel)
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m && m.toLowerCase() !== 'all')
    : [];
  if (marketplaces.length) {
    match.marketplace = { $in: marketplaces.map((m) => new RegExp(`^${m}$`, 'i')) };
  }

  if (search) {
    match.orderId = new RegExp(search, 'i');
  }

  const totalRecords = await FinanceRecord.countDocuments(match);
  const { page: currentPage, totalPages, totalElements } = getPagination(totalRecords, page, parsedLimit);

  const skip = (currentPage - 1) * parsedLimit;

  const records = await FinanceRecord.find(match)
    .sort({ orderDate: -1 })
    .skip(skip)
    .limit(parsedLimit)
    .select(
      'orderId orderAmountWithoutVAT adminCharges customersEarning logisticPrice marketplaceCommission ollTekFee paymentStatus'
    )
    .lean();

  const content = records.map((r) => {
    //Platform Commission + Marketplace commission + Marketing Fee + Logistic Cost.
    const commission =
      (r.adminCharges || 0) +
      (r.ollTekFee || 0) +
      (r.marketplaceCommission || 0) +
      (r.logisticPrice || 0) +
      (r.marketingFee || 0);
    return {
      orderId: r.orderId ?? null,
      orderValue: r.orderAmountWithoutVAT ?? null,
      commission,
      netAmount: r.customersEarning ?? null,
      status: r.paymentStatus,
      dateTime: null,
    };
  });

  return {
    content,
    totalElements,
    totalPages,
    page: currentPage,
    size: parsedLimit,
  };
};

export const getFinanceDashboard = async (sellerIds, { period, month, startDate, endDate, channel } = {}) => {
  const ids = Array.isArray(sellerIds) ? sellerIds : [sellerIds];
  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const match = { sellerId: { $in: sellerObjectIds } };

  const range = getDateRange({ period, startDate, endDate, month });
  if (range) {
    match.orderDate = { $gte: range.start, $lte: range.end };
  }

  const marketplaces = channel
    ? String(channel)
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m && m.toLowerCase() !== 'all')
    : [];
  if (marketplaces.length) {
    match.marketplace = { $in: marketplaces.map((m) => new RegExp(`^${m}$`, 'i')) };
  }

  const [result] = await FinanceRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        netGMV: { $sum: { $ifNull: ['$orderAmountWithoutVAT', 0] } },
        platformCommission: {
          $sum: { $add: [{ $ifNull: ['$ollTekFee', 0] }, { $ifNull: ['$adminCharges', 0] }] },
        },
        marketplaceCommission: { $sum: { $ifNull: ['$marketplaceCommission', 0] } },
        marketingfee: { $sum: { $ifNull: ['$marketingFee', 0] } },
        logisticCost: { $sum: { $ifNull: ['$logisticPrice', 0] } },
        totalEarnings: { $sum: { $ifNull: ['$totalDeliveredOrdersAmount', 0] } },
        amountPaid: { $sum: { $ifNull: ['$whatCustomerReceivesFromOllTek', 0] } },
      },
    },
    { $project: { _id: 0 } },
  ]);

  const data = result ?? {
    netGMV: 0,
    platformCommission: 0,
    marketplaceCommission: 0,
    marketingfee: 0,
    logisticCost: 0,
    totalEarnings: 0,
    amountPaid: 0,
  };

  return [
    { key: 'netGMV', label: 'Net GMV', value: data.netGMV },
    { key: 'platformCommission', label: 'Platform Commission', value: data.platformCommission },
    { key: 'marketplaceCommission', label: 'Marketplace Commission', value: data.marketplaceCommission },
    { key: 'marketingfee', label: 'Marketing Fee', value: data.marketingfee },
    { key: 'logisticCost', label: 'Logistic Cost', value: data.logisticCost },
    { key: 'totalEarnings', label: 'Total Earning', value: data.totalEarnings },
    { key: 'amountPaid', label: 'Amount Paid', value: null },
    { key: 'amountPending', label: 'Amount Pending', value: null },
  ];
};

export const syncFinance = async () => {
  console.log('[syncFinance] Starting sync...');

  const url = process.env.FINANCE_GOOGLE_SHEET_URL;
  console.log('[syncFinance] Sheet URL from env:', url);

  if (!isValidGoogleSheetUrl(url)) {
    console.error('[syncFinance] URL validation failed for:', url);
    throw new Error('Invalid Google Sheets URL');
  }

  const exportUrl = await convertGoogleSheetUrlToExport(url);
  console.log('[syncFinance] Export URL:', exportUrl);

  console.log('[syncFinance] Fetching sheet...');
  const sheetRes = await fetch(exportUrl);
  console.log('[syncFinance] Fetch response status:', sheetRes.status, sheetRes.statusText);

  if (!sheetRes.ok) {
    throw new Error('Failed to fetch Google Sheet');
  }

  console.log('[syncFinance] Parsing sheet stream...');
  const stream = Readable.fromWeb(sheetRes.body);
  const rawRows = await parseSheetStream(stream);
  console.log('[syncFinance] Raw rows parsed:', rawRows.length);

  if (!rawRows.length) {
    throw new Error('Google Sheet is empty or has no data rows');
  }

  console.log('[syncFinance] First raw row sample:', rawRows[0]);

  const docs = rawRows.map((row) => {
    const doc = mapRowToRecord(row);
    if (doc.sellerId) {
      try {
        doc.sellerId = mongoose.Types.ObjectId.createFromHexString(doc.sellerId);
      } catch {
        doc.sellerId = null;
      }
    }
    return doc;
  });
  console.log('[syncFinance] Mapped docs count:', docs.length);
  console.log('[syncFinance] First mapped doc sample:', docs[0]);

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: {
        orderId: doc.orderId,
        sku: doc.sku,
      },
      update: { $set: doc },
      upsert: true,
    },
  }));

  console.log('[syncFinance] Running bulkWrite with', bulkOps.length, 'operations...');
  const result = await FinanceRecord.bulkWrite(bulkOps, {
    ordered: false,
  });
  console.log('[syncFinance] bulkWrite result:', {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    matched: result.matchedCount,
  });

  return {
    totalRows: rawRows.length,
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
  };
};

export default {
  getTransactionHistory,
  getFinanceDashboard,
  syncFinance,
};
