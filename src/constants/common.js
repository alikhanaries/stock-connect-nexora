
// Define valid statuses for channels
export const VALID_STATUSES = ['active', 'deactive', 'removed'];

// Map status to display messages
export const STATUS_MESSAGES = { active: 'activated', deactive: 'deactivated', removed: 'removed' };


export const PRODUCT_STATUSES = ['active', 'deactive'];

export const ORDER_STATUS_MAP = {
  NEW: 'NEW',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  REQUIRES_CORRECTION: 'REQUIRES_CORRECTION',
  IN_BACKORDER: 'IN_BACKORDER',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELED: 'CANCELED',
  CLOSED: 'CLOSED',
  MANCO: 'MANCO',
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


