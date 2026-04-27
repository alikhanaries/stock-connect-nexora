export const ORDER_FLOW_STATUS_CONFIG = [
  { key: 'placed', label: 'New Orders', statuses: ['NEW'] },
  { key: 'inProgress', label: 'In Progress', statuses: ['IN_PROGRESS'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED', 'CANCELED'] },
  { key: 'shipped', label: 'Shipped', statuses: ['SHIPPED'] },
  { key: 'closed', label: 'Closed', statuses: ['CLOSED'] },
];

export const SHIPMENT_STATUS = [
  { statuses: ['SHIPMENT_CREATED'], label: 'Ready to ship' },
  { statuses: ['SHIPMENT_PROCESSED', 'HUB_RECIEVED', 'OUT_FOR_DELIVERY', 'OMNIFUL_PROCESSED'], label: 'In transit' },
  { statuses: ['DELIVERED'], label: 'Delivered' },
  { statuses: ['CANCELED'], label: 'Canceled' },
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

export const CHANNEL_STATUS_CONFIG = [
  { label: 'Published', key: 'PUBLISHED' },
  { label: 'Not Published', key: 'NOT_PUBLISHED' },
  { label: 'Invalid On Create', key: 'INVALID_ON_CREATE' },
  { label: 'Under Review', key: 'UNDER_REVIEW' },
  { label: 'None', key: 'NONE' },
];
