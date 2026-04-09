import mongoose from 'mongoose';
import FinanceRecord from '#models/FinanceRecord.js';
import Seller from '#models/Seller.js';
import { getDateRange } from '#helpers/dashboard.js';
import { getPagination } from '#helpers/PaginationHandler.js';

export const getTransactionHistory = async (
  sellerIds,
  { period, month, startDate, endDate, marketplace, search, page = 1, limit = 10 } = {}
) => {
  const ids = Array.isArray(sellerIds) ? sellerIds : [sellerIds];
  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const sellers = await Seller.find({ _id: { $in: sellerObjectIds }, status: 'active' })
    .select('name')
    .lean();
  if (!sellers.length) throw new Error('No sellers found');

  const brandNames = sellers.map((s) => s.name.trim());

  const match = { brand: { $in: brandNames.map((name) => new RegExp(`^${name}$`, 'i')) } };

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

  if (search) {
    match.orderId = new RegExp(search, 'i');
  }

  const totalRecords = await FinanceRecord.countDocuments(match);
  const { page: currentPage, size, totalPages, totalElements } = getPagination(totalRecords, page, limit);
  const skip = (currentPage - 1) * size;

  const records = await FinanceRecord.find(match)
    .sort({ orderDate: -1 })
    .skip(skip)
    .limit(size)
    .select('orderId orderAmountWithoutVAT')
    .lean();

  const content = records.map((r) => ({
    orderId: r.orderId ?? null,
    orderValue: r.orderAmountWithoutVAT ?? null,
    commission: null,
    netAmount: null,
    status: null,
    dateTime: null,
  }));

  return {
    content,
    totalElements,
    totalPages,
    page: currentPage,
    size,
  };
};

export default {
  getTransactionHistory,
};
