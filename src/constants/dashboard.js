export const ORDER_FLOW_STATUS_CONFIG = [
  { key: 'placed', label: 'New Orders', statuses: ['NEW'] },
  { key: 'inProgress', label: 'In Progress', statuses: ['IN_PROGRESS'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED', 'CANCELED'] },
  { key: 'shipped', label: 'Shipped', statuses: ['SHIPPED'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
];

export const SHIPMENT_STATUS = [
  { key: 'SHIPMENT_CREATED', label: 'Ready to ship' },
  { key: 'SHIPPED', label: 'In transit' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CANCELED', label: 'Canceled' },
];

export const CHANNEL_TO_GLOBAL_NAMES = Object.freeze({
  amazon: ['Amazon.in (v3)', 'Amazon.sa (v3)'],
  noon: ['Noon V2'],
  namshi: ['Namshi'],
  ocp: ['OCP'],
});

export const CHANNEL_KEY_TO_IDS = Object.freeze({
  noon: [1],
  amazon: [3],
  namshi: [4],
  ocp: [6],
  trendyol: [5],
});
