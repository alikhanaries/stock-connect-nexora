import { config } from '../config/config.js';
import Product from '#models/Product.js';
import Order from '#models/Orders.js';
import { getOmnifulAccessToken, getReportToken, upsertToken, getToken } from '../helpers/omnifulAuth.js';
import {
  omnifulApiRequest,
  OMNIFUL_GET_ORDER_PATH,
  isOmnifulApiError,
  explainOmnifulAuthError,
} from '../helpers/omnifulApiClient.js';
import { channelEnginePush } from '#service/channelEngineClient.js';
import { CE_QUEUE_OPERATIONS } from '#constants/channelEngineQueue.js';

const { OMNIFUL_API_URL, OMNIFUL_HUB_CODE, OMNIFUL_SUPPLIER_CODE, CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } =
  config;

export { getReportToken, upsertToken, getToken };

export const forwardAymakanShipment = async (shipmentData) => {
  let omnifulAccessToken = await getOmnifulAccessToken();

  if (!omnifulAccessToken) {
    throw new Error('Omniful access token not available');
  }

  {
    const skuCodes = shipmentData.products.map((p) => p.merchantProductNo);

    const productDetails = await Product.find({
      productSkuCode: { $in: skuCodes },
    }).lean();

    const productMap = {};
    productDetails.forEach((p) => {
      productMap[p.productSkuCode] = p;
    });

    const createSkuPayload = shipmentData.products
      .map((item) => {
        const skudetails = productMap[item.merchantProductNo];

        if (!skudetails) {
          throw new Error(`Product not found for SKU: ${item.merchantProductNo}`);
        }

        return {
          name: skudetails.name,
          description: skudetails.description,
          sku_code: skudetails.productSkuCode,
          type:
            skudetails.productType == null
              ? null
              : skudetails.productType.trim().toLowerCase() === 'simple'
                ? 'simple'
                : 'bundle',
          status: 'live',
          cost: skudetails.price || 0,
          retail_price: skudetails.msrp || 0,
          selling_price: skudetails.purchasePrice || 0,
          is_perishable: false,
          currency: 'SAR',
        };
      })
      .filter(Boolean);

    const createSkuResponse = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/master/skus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${omnifulAccessToken}`,
      },
      body: JSON.stringify(createSkuPayload),
    });

    const createSkuData = await createSkuResponse.json();

    if (createSkuData.is_success) {
      if (!OMNIFUL_HUB_CODE) {
        throw new Error('OMNIFUL_HUB_CODE is not configured');
      }

      if (!OMNIFUL_SUPPLIER_CODE) {
        throw new Error('OMNIFUL_SUPPLIER_CODE is not configured');
      }

      const orderFromMerchantNo = await Order.findOne({
        merchantOrderNo: shipmentData.merchantOrderNo,
      }).lean();

      const orderSkuList = orderFromMerchantNo?.orderSkuList?.skuList || [];

      const purchase_order_items = (shipmentData.products || []).map((item) => {
        const orderSku =
          orderSkuList.find((s) => String(s.id) === String(item.orderLineId)) ||
          orderSkuList.find((s) => s.merchantProductNo === item.merchantProductNo);
        const quantity = item.quantity || item.Quantity || 0;
        const unit_price =
          orderSku?.unitPriceInclVat || orderSku?.originalUnitPriceInclVat || item.originalLineTotalInclVat || 0;

        return {
          sku_code: item.merchantProductNo,
          quantity,
          unit_price,
        };
      });

      const referencePurchaseOrderId = shipmentData._id.toString();

      const createPurchaseOrderPayload = {
        supplier_code: OMNIFUL_SUPPLIER_CODE,
        purchase_order_items,
        reference_purchase_order_id: referencePurchaseOrderId,
        currency: 'SAR',
      };

      const res = await fetch(
        `${OMNIFUL_API_URL}/sales-channel/public/v1/purchase_orders/hubs/${encodeURIComponent(OMNIFUL_HUB_CODE)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            Connection: 'keep-alive',
            Authorization: `Bearer ${omnifulAccessToken}`,
          },
          body: JSON.stringify(createPurchaseOrderPayload),
        }
      );

      if (!res.ok) {
        throw new Error(`API failed with status ${res.status}`);
      }

      const json = await res.json();

      if (!json?.data?.purchase_order_id) {
        throw new Error('Invalid response structure: missing purchase_order_id');
      }

      console.log(
        `OmniFul PO created: shipment_id=${referencePurchaseOrderId} purchase_order_id=${json.data.purchase_order_id}`
      );

      return {
        purchaseOrderId: json.data.purchase_order_id,
        referencePurchaseOrderId,
        createPurchaseOrderPayload,
        createPurchaseOrderResponse: json,
      };
    }
  }
};

/**
 * Retrieve a single order from OmniFul by OmniFul internal order ID.
 *
 * Uses GET /sales-channel/public/v1/seller/orders/{omniful_order_id}
 * (Seller Custom Integration — same auth as POST /sales-channel/public/v1/orders).
 *
 * Do NOT pass the external order_id (shipment _id) here — use shipment.omniful.omnifulId
 * which equals POST response data.id / data.omniful_order_id.
 *
 * @param {string} omnifulOrderId - OmniFul internal ID (shipment.omniful.omnifulId)
 * @returns {Promise<{ data: object, status: number, requestId: string }>}
 */
export const getOmnifulOrder = async (omnifulOrderId) => {
  if (!omnifulOrderId || typeof omnifulOrderId !== 'string') {
    throw new Error('omnifulOrderId is required (OmniFul internal ID from POST response data.id)');
  }

  const encodedId = encodeURIComponent(omnifulOrderId.trim());

  try {
    return await omnifulApiRequest({
      method: 'GET',
      path: `${OMNIFUL_GET_ORDER_PATH}/${encodedId}`,
      orderId: omnifulOrderId,
    });
  } catch (err) {
    if (isOmnifulApiError(err)) {
      const explanation = explainOmnifulAuthError(err);
      if (explanation) {
        console.error('[OmniFul API] Auth/permission guidance:', JSON.stringify(explanation, null, 2));
      }
    }
    throw err;
  }
};

export const createShipmentwithCE = async (shipmentData) => {
  const omnifulAccessToken = await getOmnifulAccessToken();
  if (!omnifulAccessToken) {
    throw new Error('Access token not available');
  }

  const CEPayload = {
    MerchantShipmentNo: shipmentData.merchantShipmentNo,
    MerchantOrderNo: shipmentData.merchantOrderNo,
    Lines: shipmentData.products.map((product) => ({
      MerchantProductNo: product.merchantProductNo,
      OrderLineId: product.orderLineId,
      Quantity: product.quantity,
    })),
    TrackTraceNo: shipmentData?.omniful?.trackingNo || '',
    ReturnTrackTraceNo: '',
    Method: '',
    ShippedFromCountryCode: shipmentData?.shippedFromStockLocationId || '',
    ShipmentDate: shipmentData?.submissionDate,
    ReturnMethod: '',
    IsMerchantCreator: true,
    AirWaybillNo: shipmentData?.omniful?.trackingNo || '',
  };

  const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`;
  await channelEnginePush({
    operationType: CE_QUEUE_OPERATIONS.SHIPMENT_CREATE,
    method: 'POST',
    url: ceUrl,
    headers: { 'Content-Type': 'application/json' },
    body: CEPayload,
    awaitResult: false,
  });
};

export default {
  createShipmentwithCE,
  forwardAymakanShipment,
  getOmnifulOrder,
  getReportToken,
  upsertToken,
};
