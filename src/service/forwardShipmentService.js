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

const { OMNIFUL_API_URL, OMNIFUL_HUB_CODE, CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

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
      const orderFromMerchantNo = await Order.findOne({
        merchantOrderNo: shipmentData.merchantOrderNo,
      }).lean();

      const orderSkuList = orderFromMerchantNo.orderSkuList?.skuList || [];

      let itemsSubtotal = 0;
      let itemsTax = 0;

      const order_items = (shipmentData.products || []).map((item) => {
        const orderSku =
          orderSkuList.find((s) => String(s.id) === String(item.orderLineId)) ||
          orderSkuList.find((s) => s.merchantProductNo === item.merchantProductNo);
        const quantity = item.quantity || item.Quantity || 0;
        const selling_price =
          orderSku?.unitPriceInclVat || orderSku?.originalUnitPriceInclVat || item.originalLineTotalInclVat || 0;

        itemsSubtotal += selling_price * quantity;
        if (orderSku?.lineVat != null && orderSku.quantity) {
          itemsTax += orderSku.lineVat * (quantity / orderSku.quantity);
        }

        return {
          sku_code: item.merchantProductNo,
          name: orderSku?.description || 'Unknown Product',
          selling_price,
          quantity,
        };
      });

      const createOrderPayload = {
        // External order reference sent to OmniFul — our MongoDB shipment _id
        order_id: shipmentData._id.toString(),
        hub_code: OMNIFUL_HUB_CODE,

        order_items,

        billing_address: {
          address1: orderFromMerchantNo.orderBillingAddress?.line1,
          city: orderFromMerchantNo.orderBillingAddress?.city,
          country: orderFromMerchantNo.orderBillingAddress?.countryIso,
        },

        shipping_address: {
          address1: orderFromMerchantNo.orderShippingAddress?.line1,
          city: orderFromMerchantNo.orderShippingAddress?.city,
          country: orderFromMerchantNo.orderShippingAddress?.countryIso,
        },

        invoice: {
          currency: orderFromMerchantNo.orderPaymentDetails?.currencyCode,
          subtotal: itemsSubtotal,
          tax: itemsTax,
          discount: 0,
          total: itemsSubtotal,
          total_paid: itemsSubtotal,
          total_due: 0,
        },

        customer: {
          id: orderFromMerchantNo.orderCustomer?.orderId,
          first_name: orderFromMerchantNo.orderCustomer?.firstName,
        },

        payment_method: 'prepaid',
        is_cash_on_delivery: false,
        type: 'b2b',
      };

      const res = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
          Connection: 'keep-alive',
          Authorization: `Bearer ${omnifulAccessToken}`,
        },
        body: JSON.stringify(createOrderPayload),
      });

      if (!res.ok) {
        throw new Error(`API failed with status ${res.status}`);
      }

      const json = await res.json();

      if (!json?.data) {
        throw new Error('Invalid response structure');
      }

      /**
       * POST /orders response ID mapping (stored on shipment.omniful):
       * - id          → shipment.omniful.omnifulId       — OmniFul internal ID (omniful_order_id); use for GET
       * - order_id    → shipment.omniful.omnifulOrderId — external ID we sent (shipment MongoDB _id)
       */
      const result = {
        id: json.data.id,
        orderId: json.data.order_id,
        createOrderPayload,
        createOrderResponse: json,
      };
      return result;
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
