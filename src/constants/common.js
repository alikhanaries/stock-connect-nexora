// Define valid statuses for channels
export const VALID_STATUSES = ['active', 'inactive', 'removed'];
export const ORDER_PRIORITY = [
  'NEW', // 0 – created, nothing done
  'PENDING', // 1 – waiting for payment / confirmation
  'IN_PROGRESS', // 2 – partially processed
  'SHIPPED', // 3 – nothing pending, shipped
  'DELIVERED', // 4 – fully delivered
  'CLOSED', // 5 – delivered + canceled (final success)
  'CANCELED', // 6 – fully canceled (final failure)
  'PAYMENT_FAILED', // 7 – terminal failure
];
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
  DELIVERED: 'DELIVERED',
};

export const syncFunctions = {
  ORDER: 'lastOrderSync',
  PRODUCT: 'lastProductSync',
  INVENTORY: 'lastInventorySync',
  PRICE: 'lastPriceSync',
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
  PENDING: 'Order is pending it cannot be cancelled',
  PAYMENT_FAILED: 'Payment failed orders cannot be cancelled',
};

export const RETURN_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELED',
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
  SHIPPED: 'SHIPPED',
};

export const AMAZON_STATUS_MAP = {
  Returned: 'RETURNED',
  Delivered: 'DELIVERED',
  'In Progress': 'IN_PROGRESS',
  Canceled: 'CANCELED',
  Shipped: 'SHIPPED',
  Pending: 'PENDING',
  Unshipped: 'NEW',
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
  'extraImageUrl4',
  'extraImageUrl5',
  'extraImageUrl6',
  'extraImageUrl7',
  'extraImageUrl8',
  'extraImageUrl9',
  'extraImageUrl10',
  'extraImageUrl11',
  'extraImageUrl12',
  'extraImageUrl13',
  'extraImageUrl14',
  'gender',
  'ageRangeDescription',
  'countryOfOrigin',
  'hsCodeSA',
  'hsCodeAE',
  'imageUrl',
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
  'vatRateType',
  'volumetricWeightCm',
  'noonPrice',
  'namshiPrice',
  'amazonPrice',
  'sixthStreetPrice',
  'styliPrice',
  'amazonPrimaryImageUrl',
  'amazonImageUrl',
  'amazonExtraImageUrl1',
  'amazonExtraImageUrl2',
  'amazonExtraImageUrl3',
  'amazonExtraImageUrl4',
  'amazonExtraImageUrl5',
  'amazonExtraImageUrl6',
  'amazonExtraImageUrl7',
  'amazonExtraImageUrl8',
  'amazonExtraImageUrl9',
  'amazonExtraImageUrl10',
  'amazonExtraImageUrl11',
  'amazonExtraImageUrl12',
  'amazonExtraImageUrl13',
  'amazonExtraImageUrl14',
  // Amazon marketplace listing attributes
  'variationThemeName',
  'modelNumber',
  'modelName',
  'style',
  'bulletPoint',
  'footwearSizeSystem',
  'footwearAgeGroup',
  'footwearSizeClass',
  'footwearWidth',
  'footwearSize',
  'soleMaterial',
  'toeStyle',
  'heightMap',
  'heelType',
  'waterResistanceLevel',
  'closure',
  'shaftCircumference',
  'shaftHeight',
  'skipOffer',
  'itemCondition',
  'listPriceCurrency',
  'dangerousGoodsRegulations',
  'outerMaterial',
  'departmentName',
  'sizeSystem',
  'sizeClass',
  'bodyType',
  'heightType',
  'fabricType',
  'specialSize',
  'weaveType',
  'careInstructions',
  'shippingTemplateSA',
  'fitType',
  'riseStyle',
  'closureType',
  'occasion',
  'subtype',
  'sleeveType',
  'neck',
  'material',
  'pattern',
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

export const SHIPMENT_EXPORT_HEADERS = [
  'Product SKUs',
  'Merchant Shipment Number',
  'Tracking Number (AWB)',
  'Order ID',
  'Merchant Order Number',
  'Channel Order ID',
  'Sales Channel',
  'Shipment Status',
  'Shipment Method',
  'Number of Packages',
  'Order Status',
  'Shipment Created Date',
  'Shipment Last Updated Date',
  'Order Date',
  'Total Products',
  'Total Quantity',
  'Subtotal Amount',
  'Tax Amount (VAT)',
  'Total Amount',
  'Tracking Updates Count',
  'Latest Tracking Status Code',
  'Latest Tracking Status Description',
  'Latest Tracking Date',
  'Tracking Status History',
];

export const AMAZON_CHANNEL_NAME = 'Amazon.sa (v3)';

export const ALLOWEDMARKETPLACES = [AMAZON_CHANNEL_NAME, 'Noon V2', 'Trendyol.int SA', 'Namshi'];

export const LOW_STOCK_THRESHOLD_SELLERS = ['kip', 'ramsey'];

export const LOW_STOCK_THRESHOLD = 3;

export const MAX_PRICE_SELLERS = ['kip', 'ramsey', 'exquise'];

export const MAX_PRICE = 1145;

export const AYMAKAN_VAT_DIVISOR = 1.15;
export const AYMAKAN_PRICE_CURRENCY = 'USD';

export const ERP_SYNC_BRAND_SLUGS = {
  entegra: ['krahe', 'manijero'],
  xokids: [
    'xokids',
    'hapshoe_kids',
    'moonstar',
    'hype',
    'bravokids',
    'rakerplus',
    'nk_kids',
    'top_teens',
    'grata',
    'top_girl',
    'bella_donna',
    'hamada_tex',
  ],
  kip: ['kip'],
  ramsey: ['ramsey'],
  exquise: ['exquise'],
  catch: ['catch'],
  sentos: ['sentos'],
};
