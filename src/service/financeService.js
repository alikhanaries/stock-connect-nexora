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
  const url = process.env.FINANCE_GOOGLE_SHEET_URL;

  if (!isValidGoogleSheetUrl(url)) {
    throw new Error('Invalid Google Sheets URL');
  }

  const exportUrl = await convertGoogleSheetUrlToExport(url);

  const sheetRes = await fetch(exportUrl);

  if (!sheetRes.ok) {
    throw new Error('Failed to fetch Google Sheet');
  }

  const stream = Readable.fromWeb(sheetRes.body);
  const rawRows = await parseSheetStream(stream);

  if (!rawRows.length) {
    throw new Error('Google Sheet is empty or has no data rows');
  }

  const allDocs = rawRows.map((row) => mapRowToRecord(row));

  const filteredDocs = new Map();
  for (const doc of allDocs) {
    const key = `${doc.sellerId}|${doc.orderId}`;
    const existing = filteredDocs.get(key);
    if (!existing) {
      filteredDocs.set(key, doc);
    } else if (doc.orderAmountWithoutVAT != null && existing.orderAmountWithoutVAT == null) {
      filteredDocs.set(key, doc);
    }
  }
  const docs = [...filteredDocs.values()];

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: {
        sellerId: doc.sellerId,
        orderId: doc.orderId,
      },
      update: { $set: doc },
      upsert: true,
    },
  }));
  const result = await FinanceRecord.bulkWrite(bulkOps, {
    ordered: false,
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
