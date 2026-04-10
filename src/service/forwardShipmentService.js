const {
  OMNIFUL_API_URL,
  OMNIFUL_HUB_CODE,
  CHANNEL_ENGINE_BASE_URL,
  CHANNEL_ENGINE_API_KEY,
  OMNIFUL_CLIENT_ID,
  OMNIFUL_CLIENT_SECRET,
} = config;
import { config } from '../config/config.js';
import Product from '#models/Product.js';
import Order from '#models/Orders.js';
import Token from '../models/Token.js';
export const getToken = async () => {
  return await Token.findOne({ name: 'omniful' });
};

export const upsertToken = async ({ accessToken, refreshToken }) => {
  await Token.findOneAndUpdate(
    { name: 'omniful' },
    { accessToken, refreshToken, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

const isOlderThan25Days = (updatedAt) => {
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > 25 * 24 * 60 * 60 * 1000;
};

// Internal API call to refresh token
const fetchNewTokens = async (refreshToken) => {
  const response = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: OMNIFUL_CLIENT_ID,
      client_secret: OMNIFUL_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error('Token API failed');
  }
  const data = await response.json();

  return {
    accessToken: data?.data?.access_token,
    refreshToken: data?.data?.refresh_token,
  };
};

export const getReportToken = async () => {
  const tokenDoc = await getToken();

  if (!tokenDoc) {
    const refreshTokenToUse = process.env.OMNIFUL_REFRESH_TOKEN;
    if (!refreshTokenToUse) {
      throw new Error('Token not initialized in DB');
    }
    const newTokens = await fetchNewTokens(refreshTokenToUse);
    await upsertToken(newTokens);
    return newTokens.accessToken;
  }

  if (!isOlderThan25Days(tokenDoc.updatedAt)) {
    return tokenDoc.accessToken;
  }

  const refreshTokenToUse = tokenDoc.refreshToken || process.env.OMNIFUL_REFRESH_TOKEN;
  const newTokens = await fetchNewTokens(refreshTokenToUse);
  await upsertToken(newTokens);

  return newTokens.accessToken;
};

export const forwardAymakanShipment = async (shipmentData) => {
  let omnifulAccessToken = await getReportToken();

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

      const createOrderPayload = {
        order_id: shipmentData._id.toString(),
        hub_code: OMNIFUL_HUB_CODE,

        order_items: (shipmentData.products || []).map((item) => ({
          sku_code: item.merchantProductNo,
          name:
            orderFromMerchantNo.orderSkuList?.skuList?.find((s) => s.merchantProductNo === item.merchantProductNo)
              ?.description || 'Unknown Product',
          selling_price: item.lineTotalInclVat || 0,
          quantity: item.quantity || item.Quantity || 0,
        })),

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
          total: (shipmentData.products || []).reduce((sum, p) => sum + (p.lineTotalInclVat || 0), 0),
        },

        customer: {
          id: orderFromMerchantNo.orderCustomer?.orderId,
          first_name: orderFromMerchantNo.orderCustomer?.firstName,
        },

        payment_method: 'prepaid',
        is_cash_on_delivery: false,
        type: 'b2b',
      };

      await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${omnifulAccessToken}`,
        },
        body: JSON.stringify(createOrderPayload),
      });
    }
  }
};

export const createShipmentwithCE = async (shipmentData) => {
  const omnifulAccessToken = await getReportToken();
  if (!omnifulAccessToken) {
    throw new Error('Access token not available');
  }
  const orderId = shipmentData._id.toString();
  const getOrderResponse = await fetch(`${OMNIFUL_API_URL}/sales-channel/public/v1/orders/${orderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${omnifulAccessToken}`,
    },
  });

  const getOrderResponseData = await getOrderResponse.json();
  const CEPayload = {
    MerchantShipmentNo: shipmentData.merchantShipmentNo,
    MerchantOrderNo: shipmentData.merchantOrderNo,
    Lines: shipmentData.products.map((product) => ({
      MerchantProductNo: product.merchantProductNo,
      OrderLineId: product.orderLineId,
      Quantity: product.quantity,
    })),
    TrackTraceNo: getOrderResponseData?.data?.shipment?.awb_number || '',
    ReturnTrackTraceNo: '',
    Method: '',
    ShippedFromCountryCode: getOrderResponseData?.data?.billing_address?.country,
    ShipmentDate: getOrderResponseData?.data?.order_created_at,
    ReturnMethod: '',
    IsMerchantCreator: true,
    AirWaybillNo: getOrderResponseData?.data?.shipment?.awb_number,
  };

  const ceUrl = `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`;
  await fetch(ceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CEPayload),
  });
};

export default {
  createShipmentwithCE,
  forwardAymakanShipment,
  getReportToken,
  upsertToken,
};
