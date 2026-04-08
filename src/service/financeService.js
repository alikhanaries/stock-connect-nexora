import { Readable } from 'stream';
import { convertGoogleSheetUrlToExport, isValidGoogleSheetUrl } from '#helpers/googleSheetFormaterHandler.js';
import { mapRowToRecord, parseSheetStream } from '#helpers/financeSheetHandler.js';
import FinanceRecord from '#models/FinanceRecord.js';
import Seller from '#models/Seller.js';
import { getDateRange } from '#helpers/dashboard.js';

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

  const docs = rawRows.map((row) => mapRowToRecord(row));

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: {
        awb: doc.awb,
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

export const getFinanceDashboard = async ({ sellerId, period, month, startDate, endDate, marketplace }) => {
  const seller = await Seller.findById(sellerId).select('name').lean();
  if (!seller) throw new Error('Seller not found');

  const brandRegex = new RegExp(`^${seller.name.trim()}$`, 'i');
  const match = { brand: brandRegex };

  const range = getDateRange({ period, startDate, endDate, month });
  if (range) {
    match.orderDate = { $gte: range.start, $lte: range.end };
  }

  if (marketplace) match.marketplace = new RegExp(`^${marketplace.trim()}$`, 'i');

  const [result] = await FinanceRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        netGMV: { $sum: { $ifNull: ['$orderAmountWithoutVAT', 0] } },
        platformCommission: {
          $sum: { $add: [{ $ifNull: ['$ollTekFee', 0] }, { $ifNull: ['$adminCharges', 0] }] },
        },
        marketplaceCommission: { $sum: { $ifNull: ['$marketplaceCommissionSharedWithCustomer', 0] } },
        logisticCost: { $sum: { $ifNull: ['$logisticPriceSharedWithCustomer', 0] } },
        totalEarnings: { $sum: { $ifNull: ['$totalDeliveredOrdersAmount', 0] } },
        amountPaid: { $sum: { $ifNull: ['$whatCustomerReceivesFromOllTek', 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        netGMV: 1,
        platformCommission: 1,
        marketplaceCommission: 1,
        logisticCost: 1,
        totalEarnings: 1,
        amountPaid: null,
        amountPending: null,
      },
    },
  ]);

  return (
    result ?? {
      netGMV: 0,
      platformCommission: 0,
      marketplaceCommission: 0,
      logisticCost: 0,
      totalEarnings: 0,
      amountPaid: 0,
      amountPending: 0,
    }
  );
};

export default {
  syncFinance,
  getFinanceDashboard,
};
