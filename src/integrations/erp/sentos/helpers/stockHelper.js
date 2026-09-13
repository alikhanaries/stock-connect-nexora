import { sentosConfig } from '../config/config.js';

export const getWarehouseStock = (stocks = [], warehouseId = sentosConfig.SENTOS_WAREHOUSE_ID) => {
  if (!Array.isArray(stocks)) return 0;
  const row = stocks.find((item) => Number(item?.warehouse) === Number(warehouseId));
  return Number(row?.stock) || 0;
};
