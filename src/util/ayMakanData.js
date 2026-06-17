export const AYMAKAN_STATUS = {
  'AY-0001': {
    status: 'SHIPMENT_CREATED',
    description: 'Shipment is created at collection point',
  },
  'AY-0002': {
    status: 'SHIPMENT_PROCESSED',
    description: 'Shipment was collected from collection point',
  },
  'AY-0003': {
    status: 'HUB_RECIEVED',
    description: 'Shipment is received at hub',
  },
  'AY-0026': {
    status: 'SHIPPED',
    description: 'Received at Riyadh Warehouse',
  },
  'AY-0004': {
    status: 'OUT_FOR_DELIVERY',
    description: 'Shipment is out for its final destination.',
  },
  'AY-0005': {
    status: 'HUB_RECIEVED',
    description: 'Shipment is received at hub',
  },
  'AY-0006': {
    status: 'NOT_DELIVERED',
    description: 'Shipment was not delivered - delivery was delayed by customer',
  },
  'AY-0029': {
    status: 'CANCELED',
    description: 'Pickup Cancelled - By Customer: OCP',
  },
  'AY-0032': {
    status: 'SHIPMENT_REPROCESSING',
    description: 'Shipment is pending - Future Delivery',
  },
  'AY-0011': {
    status: 'CANCELED',
    description: 'Shipment is canceled',
  },
};

export const AYMAKAN_INFO = {
  NAME: 'Aymakan',
  EMAIL: 'deliver@aymakan.com',
};
