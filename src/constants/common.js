// Define valid statuses for channels
export const VALID_STATUSES = ['active', 'inactive', 'removed'];

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
].join(' ');

export const BLOCKED_STATUSES = {
  MANCO: 'Order has already been cancelled',
  CLOSED: 'Order has already been closed',
  RETURNED: 'Order has been returned, cannot cancel',
  SHIPPED: 'Order has been shipped, cannot cancel now',
};
