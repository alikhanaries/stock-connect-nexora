export const ORDER_FLOW_STATUS_CONFIG = [
  { key: 'placed', label: 'Orders Placed', statuses: ['NEW'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED', 'CANCELED'] },
  { key: 'shipped', label: 'Shipped', statuses: ['SHIPPED'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'returned', label: 'Returned', statuses: ['RETURNED'] },
  { key: 'refunded', label: 'Refunded', statuses: ['REFUNDED'] },
];

export const SHIPMENT_STATUS = [
  { key: 'SHIPMENT_CREATED', label: 'Ready to ship' },
  { key: 'SHIPPED', label: 'In transit' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CANCELED', label: 'Canceled' },
];
