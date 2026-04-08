import FinanceRecord from '#models/FinanceRecord.js';
import Seller from '#models/Seller.js';
import { getDateRange } from '#helpers/dashboard.js';
import mongoose from 'mongoose';

export const getFinanceDashboard = async (sellerIds, { period, month, startDate, endDate, marketplace } = {}) => {
  const ids = Array.isArray(sellerIds) ? sellerIds : [sellerIds];
  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const sellers = await Seller.find({ _id: { $in: sellerObjectIds } })
    .select('name')
    .lean();
  if (!sellers.length) throw new Error('No sellers found');

  const match = { brand: { $in: sellers.map((s) => new RegExp(`^${s.name.trim()}$`, 'i')) } };

  const range = getDateRange({ period, startDate, endDate, month });
  if (range) {
    match.orderDate = { $gte: range.start, $lte: range.end };
  }

  const marketplaces = marketplace
    ? String(marketplace)
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
        marketplaceCommission: { $sum: { $ifNull: ['$marketplaceCommissionSharedWithCustomer', 0] } },
        logisticCost: { $sum: { $ifNull: ['$logisticPriceSharedWithCustomer', 0] } },
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
    logisticCost: 0,
    totalEarnings: 0,
    amountPaid: 0,
  };

  return [
    { key: 'netGMV', label: 'Net GMV', value: data.netGMV },
    { key: 'platformCommission', label: 'Platform Commission', value: data.platformCommission },
    { key: 'marketplaceCommission', label: 'Marketplace Commission', value: data.marketplaceCommission },
    { key: 'logisticCost', label: 'Logistic Cost', value: data.logisticCost },
    { key: 'totalEarnings', label: 'Total Earning', value: data.totalEarnings },
    { key: 'amountPaid', label: 'Amount Paid', value: null },
    { key: 'amountPending', label: 'Amount Pending', value: null },
  ];
};

export default {
  getFinanceDashboard,
};
