import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { processInBatches } from './batchHelper.js';

export const formatNebimProducts = async (raw = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(raw)) return [];
  return await processInBatches(raw, batchSize, (item) => canonicalProductMapper(item, sellerId));
};

export const formatNebimOrders = async (orders = [], batchSize = 500) => {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  return await processInBatches(orders, batchSize, (order) => ({
    ModelType: 4,
    ItemTypeCode: 1,
    OrderNo: order.orderId,
    OrderDate: order.orderDate,
    Customer: {
      Name: `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim(),
      Email: order.orderCustomer?.email || '',
      Phone: order.orderCustomer?.phone || '',
      VatNo: order.orderPaymentDetails?.vatNo || '',
    },
    BillingAddress: {
      ...order.orderBillingAddress,
    },
    ShippingAddress: {
      ...order.orderShippingAddress,
    },
    Payment: {
      Method: order.orderPaymentDetails?.paymentMethod || '',
      Currency: order.orderPaymentDetails?.currencyCode || '',
      TotalAmount: order.totalInclVat || 0,
    },
    Items: (order.orderSkuList?.skuList || []).map((item) => ({
      SKU: item.merchantProductNo || item.channelProductNo || '',
      Quantity: item.quantity || 0,
      UnitPrice: item.unitPriceInclVat || 0,
      TotalPrice: item.lineTotalInclVat || 0,
      VatRate: item.vatRate || 0,
      Description: item.description || '',
    })),
    Comments: order.merchantComment || '',
    Status: order.status || '',
    IsBusinessOrder: order.isBusinessOrder || false,
  }));
   
};
