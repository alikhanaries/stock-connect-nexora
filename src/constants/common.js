// Define valid statuses for channels
export const VALID_STATUSES = ['active', 'inactive', 'removed'];
export const ORDER_PRIORITY = ['NEW', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED', 'CANCELED', 'PAYMENT_FAILED'];
// Map status to display messages
export const STATUS_MESSAGES = { active: 'activated', inactive: 'inactivated', removed: 'removed' };

export const LANGUAGE_CODES = ['en', 'ar', 'zh-CN', 'tr'];

export const PRODUCT_STATUSES = ['active', 'inactive'];

export const VALID_PERIODS = ['week', 'month', 'year'];

export const ORDER_STATUS_MATCH = ['NEW', 'IN_PROGRESS', 'SHIPPED', 'CLOSED'];

export const SELLER_TYPE = {
  BASE: 'base',
  NORMAL: 'normal',
};

export const OCP_STATUS_MAP = {
  CREATED: 'NEW',
  PENDING: 'NEW',
  PAYMENT_INITIATED: 'NEW',
  PAYMENT_PENDING: 'NEW',
  AWAITING_SHIPMENT: 'IN_PROGRESS',
  SHIPMENT_CREATED: 'IN_PROGRESS',
  PICKED: 'IN_PROGRESS',
  PACKED: 'IN_PROGRESS',
  OUT_FOR_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELED',
  PAYMENT_CANCELLED: 'CANCELED',
  RETURNED: 'CANCELED',
  NOT_DELIVERED: 'CANCELED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
};

export const USER_ROLES = {
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  MASTER_ADMIN: 'master_admin',
};

export const ROLES_BASED_USER_CREATION = {
  master_admin: ['master_admin', 'super_admin', 'admin'],
  super_admin: ['admin', 'super_admin'],
  admin: [],
};

export const ROLES_BASED_USER_FETCHING = {
  master_admin: ['master_admin', 'super_admin', 'admin'],
  super_admin: ['admin', 'super_admin'],
  admin: ['admin', 'super_admin'],
};

export const CHANNEL_IMAGE_MAP = {
  1733: 'https://axevhvmfbgbd.compat.objectstorage.me-riyadh-1.oraclecloud.com/stock_connect_assests/images/suppliers/amazion123456789',
  1892: 'https://axevhvmfbgbd.compat.objectstorage.me-riyadh-1.oraclecloud.com/stock_connect_assests/images/suppliers/noon',
  1635: 'https://axevhvmfbgbd.compat.objectstorage.me-riyadh-1.oraclecloud.com/stock_connect_assests/images/suppliers/amazion123456789',
  10000000:
    'https://objectstorage.me-riyadh-1.oraclecloud.com/n/axevhvmfbgbd/b/stock_connect_assests/o/images/suppliers/OCP',
  2082: 'https://objectstorage.me-riyadh-1.oraclecloud.com/n/axevhvmfbgbd/b/stock_connect_assests/o/images/suppliers/Trendyol_logo.svg.png',
  1893: 'https://objectstorage.me-riyadh-1.oraclecloud.com/n/axevhvmfbgbd/b/stock_connect_assests/o/images/suppliers/namshi.jpg',
};

export const ORDER_STATUS_MAP = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  REQUIRES_CORRECTION: 'REQUIRES_CORRECTION',
  IN_BACKORDER: 'IN_BACKORDER',
  SHIPPED: 'SHIPPED',
  RETURNED: 'RETURNED',
  CANCELED: 'CANCELED',
  CLOSED: 'CLOSED',
  MANCO: 'MANCO',
  IN_COMBI: 'IN_COMBI',
  PARTIALLY_CANCELED: 'PARTIALLY_CANCELED',
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
};

export const SELECTED_FIELDS = [
  '_id',
  'orderId',
  'orderCustomer.firstName',
  'orderCustomer.lastName',
  'orderCustomer.email',
  'orderCustomer.phone',
  'orderSkuList.skuList',
  'status',
  'channelName',
  'orderDate',
  'createdAt',
  'channelId',
  'totalInclVat',
].join(' ');

export const BLOCKED_STATUSES = {
  MANCO: 'Order has already been cancelled',
  CLOSED: 'Order has already been closed',
  RETURNED: 'Order has been returned, cannot cancel',
  SHIPPED: 'Order has been shipped, cannot cancel now',
  CANCELED: 'Order has already been cancelled',
};

export const RETURN_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
};

export const PRODUCT_EXPORT_HEADERS = [
  'grandParentProductSkuCode',
  'parentProductSkuCode',
  'productSkuCode',
  'brand',
  'categoryTrail',
  'color',
  'stock',
  'description',
  'DescriptionAr',
  'ean',
  'extraImageUrl1',
  'extraImageUrl2',
  'extraImageUrl3',
  'gender',
  'hsCodeSA',
  'hsCodeAE',
  'imageUrl',
  'ExtraImageUrl1',
  'ExtraImageUrl2',
  'ExtraImageUrl3',
  'maxPrice',
  'minPrice',
  'msrp',
  'ProductName',
  'ProductNameAr',
  'price',
  'primaryImageUrl',
  'purchasePrice',
  'shippingCost',
  'shippingTime',
  'size',
  'sizeType',
  'vatRateType',
  'volumetricWeightCm',
];

export const ORDER_EXPORT_EXCLUDED_COLUMNS = [
  'sellerId',
  'channelId',
  'globalChannelId',
  'globalChannelName',
  'merchantComment',
  'originalShippingCostsInclVat',
  'originalSubTotalFee',
  'originalOrderFee',
  'originalTotalFee',
  'totalFee',
  'orderShippingAddress_gender',
  'orderBillingAddress_gender',
  'orderCustomer_languageCode',
  'orderPaymentDetails_currencyCode',
];
