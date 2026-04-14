// Maps CSV header names → FinanceRecord model field names
export const FINANCE_HEADER_MAP = {
  Marketplace: 'marketplace',
  'Order ID': 'orderId',
  Item_Ref: 'itemRef',
  Brand: 'brand',
  'Seller ID': 'sellerId',
  SKU: 'sku',
  'SKU Status': 'skuStatus',
  'Order Date': 'orderDate',
  'Delivered Date': 'deliveredDate',
  'Total Delivered orders Amount': 'totalDeliveredOrdersAmount',
  'Order Amount (Without VAT)': 'orderAmountWithoutVAT',
  'Logistic Price': 'logisticPrice',
  'Admin Charges': 'adminCharges',
  'Marketplace Commission': 'marketplaceCommission',
  'OllTek Fee': 'ollTekFee',
  'Marketing Fee': 'marketingFee',
  "Customer's Earning": 'customersEarning',
  'Payment Status': 'paymentStatus',
};

export const FINANCE_DATE_FIELDS = new Set(['orderDate', 'deliveredDate']);

export const FINANCE_NUMBER_FIELDS = new Set([
  'totalDeliveredOrdersAmount',
  'orderAmountWithoutVAT',
  'logisticPrice',
  'adminCharges',
  'marketplaceCommission',
  'ollTekFee',
  'marketingFee',
  'customersEarning',
]);
