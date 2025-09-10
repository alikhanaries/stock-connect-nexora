// Define valid statuses for channels
export const VALID_STATUSES = ['active', 'deactive', 'removed'];

// Map status to display messages
export const STATUS_MESSAGES = { active: 'activated', deactive: 'deactivated', removed: 'removed' };

export const LANGUAGE_CODES = ['en', 'ar', 'zh-CN', 'tr'];

export const PRODUCT_STATUSES = ['active', 'deactive'];

export const ROLES_BASED_USER_CRETATION = {
  platform_master: ['platform_master', 'brand_super_admin', 'seller_admin'],
  brand_super_admin: ['brand_super_admin', 'seller_admin'],
  seller_admin: [],
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
