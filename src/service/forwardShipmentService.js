const { OMNIFUL_HUB_CODE, OMNIFUL_API_URL } = config;
import Product from '#models/Product.js';
import { config } from '../config/config.js';
import Order from '#models/Orders.js';
import Token from '../models/token.js';
export const getToken = async () => {
  return await Token.findOne({ name: 'omniful' });
};

export const forwardAymakanShipment = async (shipmentData) => {
  const omnifulAccessToken = await getReportToken();

  if (!omnifulAccessToken) {
    throw new Error('Omniful access token not available');
  }

  if (omnifulAccessToken) {
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
          sku_code: shipmentData.airWaybillNo,
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
