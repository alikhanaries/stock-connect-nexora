import Order from '#models/Orders.js';
import { formatValueForCSV } from './export.js';
import { formatDateTime } from './Common.js';
import Product from '../models/Product.js';
const sanitizeOrdersData = async (orders) => {
  const orderIds = [];
  const skuSet = new Set();

  orders.forEach((order) => {
    if (order.Id) orderIds.push(order.Id);

    if (Array.isArray(order.Lines)) {
      order.Lines.forEach((line) => {
        if (line.MerchantProductNo) {
          skuSet.add(line.MerchantProductNo);
        }
      });
    }
  });

  const [existingOrdersDb, productsDb] = await Promise.all([
    Order.find({ orderId: { $in: orderIds } }).lean(),
    Product.find({ productSkuCode: { $in: Array.from(skuSet) } })
      .select('productSkuCode sellerId')
      .lean(),
  ]);

  const existingOrdersMap = new Map(existingOrdersDb.map((o) => [o.orderId, o]));
  const productSellerMap = new Map(productsDb.map((p) => [p.productSkuCode, p.sellerId]));

  return orders.map((data) => {
    const existingOrder = existingOrdersMap.get(String(data.Id));

    let finalSellerId;

    if (Array.isArray(data.Lines) && data.Lines.length > 0) {
      const firstSku = data.Lines[0].MerchantProductNo;
      if (firstSku) {
        finalSellerId = productSellerMap.get(firstSku) || null;
      }
    }

    const skuList = Array.isArray(data.Lines)
      ? data.Lines.map((line) => {
          // Preserve existing airWaybillNo if it exists
          const existingSku = existingOrder?.orderSkuList?.skuList?.find((s) => s.id === line.Id);
          return {
            id: line.Id,
            channelOrderLineNo: line.ChannelOrderLineNo,
            // Preserve status if SKU already exists
            status: existingSku ? existingSku.status : line.Status,
            isFulfillmentByMarketplace: line.IsFulfillmentByMarketplace,
            gtin: line.Gtin,
            description: line.Description,
            stockLocation: line.StockLocation,
            unitVat: line.UnitVat,
            lineTotalInclVat: line.LineTotalInclVat,
            lineVat: line.LineVat,
            originalUnitPriceInclVat: line.OriginalUnitPriceInclVat,
            originalUnitVat: line.OriginalUnitVat,
            originalLineTotalInclVat: line.OriginalLineTotalInclVat,
            originalLineVat: line.OriginalLineVat,
            originalFeeFixed: line.OriginalFeeFixed,
            bundleProductMerchantProductNo: line.BundleProductMerchantProductNo,
            bundleOrderLineId: line.BundleOrderLineId,
            jurisCode: line.JurisCode,
            jurisName: line.JurisName,
            vatRate: line.VatRate,
            unitPriceExclVat: line.UnitPriceExclVat,
            lineTotalExclVat: line.LineTotalExclVat,
            originalUnitPriceExclVat: line.OriginalUnitPriceExclVat,
            originalLineTotalExclVat: line.OriginalLineTotalExclVat,
            extraData: line.ExtraData,
            channelProductNo: line.ChannelProductNo,
            merchantProductNo: line.MerchantProductNo,
            quantity: line.Quantity,
            cancellationRequestedQuantity:
              existingSku?.cancellationRequestedQuantity ?? line.CancellationRequestedQuantity,
            unitPriceInclVat: line.UnitPriceInclVat,
            feeFixed: line.FeeFixed,
            feeRate: line.FeeRate,
            condition: line.Condition,
            exactDeliveryDate: line.ExactDeliveryDate,
            expectedDeliveryDate: line.ExpectedDeliveryDate,
            latestDeliveryDate: line.LatestDeliveryDate,
            exactShipmentDate: line.ExactShipmentDate,
            expectedShipmentDate: line.ExpectedShipmentDate,
            latestShipmentDate: line.LatestShipmentDate,
            airWaybillNo: existingSku?.airWaybillNo ?? null, // preserve existing value
          };
        })
      : [];

    const updatePayload = {
      orderId: data.Id,
      channelId: data.ChannelId,
      sellerId: finalSellerId,
      channelName: data.ChannelName,
      globalChannelName: data.GlobalChannelName,
      globalChannelId: data.GlobalChannelId,
      orderDate: data.OrderDate,
      merchantComment: data.MerchantComment,
      merchantOrderNo: data.MerchantOrderNo,
      isBusinessOrder: data.IsBusinessOrder,
      subTotalInclVat: data.SubTotalInclVat,
      subTotalVat: data.SubTotalVat,
      shippingCostsInclVat: data.ShippingCostsInclVat,
      totalInclVat: data.TotalInclVat,
      totalVat: data.TotalVat,
      originalSubTotalInclVat: data.OriginalSubTotalInclVat,
      originalSubTotalVat: data.OriginalSubTotalVat,
      originalShippingCostsInclVat: data.OriginalShippingCostsInclVat,
      originalShippingCostsVat: data.OriginalShippingCostsVat,
      originalTotalInclVat: data.OriginalTotalInclVat,
      originalTotalVat: data.OriginalTotalVat,
      subTotalExclVat: data.SubTotalExclVat,
      totalExclVat: data.TotalExclVat,
      shippingCostsExclVat: data.ShippingCostsExclVat,
      originalSubTotalExclVat: data.OriginalSubTotalExclVat,
      originalShippingCostsExclVat: data.OriginalShippingCostsExclVat,
      originalTotalExclVat: data.OriginalTotalExclVat,
      originalSubTotalFee: data.OriginalSubTotalFee,
      subTotalFee: data.SubTotalFee,
      originalOrderFee: data.OriginalOrderFee,
      orderFee: data.OrderFee,
      originalTotalFee: data.OriginalTotalFee,
      totalFee: data.TotalFee,
      orderCustomer: {
        orderId: data.Id,
        gender: data.BillingAddress.Gender,
        firstName: data.BillingAddress.FirstName,
        lastName: data.BillingAddress.LastName,
        phone: data.Phone,
        email: data.Email,
        languageCode: data.LanguageCode,
        companyRegistrationNo: data.CompanyRegistrationNo,
        channelCustomerNo: data.ChannelCustomerNo,
      },
      orderPaymentDetails: {
        orderId: data.Id,
        vatNo: data.VatNo,
        paymentMethod: data.PaymentMethod,
        paymentReferenceNo: data.PaymentReferenceNo,
        currencyCode: data.CurrencyCode,
      },
      orderSkuList: {
        orderId: data.Id,
        skuList,
      },
      orderShippingAddress: {
        line1: data.ShippingAddress.Line1,
        line2: data.ShippingAddress.Line2,
        line3: data.ShippingAddress.Line3,
        gender: data.ShippingAddress.Gender,
        companyName: data.ShippingAddress.CompanyName,
        firstName: data.ShippingAddress.FirstName,
        lastName: data.ShippingAddress.LastName,
        streetName: data.ShippingAddress.StreetName,
        houseNr: data.ShippingAddress.HouseNr,
        houseNrAddition: data.ShippingAddress.HouseNrAddition,
        zipCode: data.ShippingAddress.ZipCode,
        city: data.ShippingAddress.City,
        region: data.ShippingAddress.Region,
        countryIso: data.ShippingAddress.CountryIso,
      },
      orderBillingAddress: {
        line1: data.BillingAddress.Line1,
        line2: data.BillingAddress.Line2,
        line3: data.BillingAddress.Line3,
        gender: data.BillingAddress.Gender,
        companyName: data.BillingAddress.CompanyName,
        firstName: data.BillingAddress.FirstName,
        lastName: data.BillingAddress.LastName,
        streetName: data.BillingAddress.StreetName,
        houseNr: data.BillingAddress.HouseNr,
        houseNrAddition: data.BillingAddress.HouseNrAddition,
        zipCode: data.BillingAddress.ZipCode,
        city: data.BillingAddress.City,
        region: data.BillingAddress.Region,
        countryIso: data.BillingAddress.CountryIso,
      },
    };
    // Only set status if the order is new
    if (!existingOrder) {
      updatePayload.status = data.Status;
    }
    const updateOperation = {
      $set: updatePayload,
    };

    return {
      updateOne: {
        filter: { orderId: data.Id },
        update: updateOperation,
        upsert: true,
      },
    };
  });
};

const getPeriodDate = (lowercasedPeriod) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentPeriodStart, previousPeriodStart, previousPeriodEnd;

  if (lowercasedPeriod === 'year') {
    const year = today.getFullYear();

    currentPeriodStart = new Date(year, 0, 1);

    previousPeriodStart = new Date(year - 1, 0, 1);
    previousPeriodEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);
  } else if (lowercasedPeriod === 'month') {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    currentPeriodStart = new Date(currentYear, currentMonth, 1);

    previousPeriodStart = new Date(currentYear, currentMonth - 1, 1);
    previousPeriodEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  } else if (lowercasedPeriod === 'week') {
    const dayOfWeek = today.getDay();
    const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

    currentPeriodStart = new Date(today);
    currentPeriodStart.setDate(diffToMonday);
    currentPeriodStart.setHours(0, 0, 0, 0);

    previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);

    previousPeriodEnd = new Date(currentPeriodStart);
    previousPeriodEnd.setMilliseconds(-1);
  } else {
    throw new Error(`Unsupported period: ${lowercasedPeriod}`);
  }

  return { currentPeriodStart, previousPeriodStart, previousPeriodEnd };
};

// Helper function to flatten aggregated order data
export const flattenAggregatedOrder = (order) => {
  const flattened = { ...order };

  // Flatten orderCustomer
  if (order.orderCustomer) {
    Object.keys(order.orderCustomer).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        flattened[`orderCustomer_${key}`] = order.orderCustomer[key];
      }
    });
  }

  // Flatten orderPaymentDetails
  if (order.orderPaymentDetails) {
    Object.keys(order.orderPaymentDetails).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        flattened[`orderPaymentDetails_${key}`] = order.orderPaymentDetails[key];
      }
    });
  }

  // Flatten orderShippingAddress
  if (order.orderShippingAddress) {
    Object.keys(order.orderShippingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        flattened[`orderShippingAddress_${key}`] = order.orderShippingAddress[key];
      }
    });
  }

  // Flatten orderBillingAddress
  if (order.orderBillingAddress) {
    Object.keys(order.orderBillingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        flattened[`orderBillingAddress_${key}`] = order.orderBillingAddress[key];
      }
    });
  }

  // Handle orderSkuList and skuList array
  if (order.orderSkuList) {
    // Skip orderSkuList.orderId as it duplicates the main orderId

    if (Array.isArray(order.orderSkuList.skuList)) {
      flattened['orderSkuList_skuList_count'] = order.orderSkuList.skuList.length;

      // Flatten key fields from skuList
      flattened['skuList_id_list'] = order.orderSkuList.skuList.map((sku) => sku.id || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_merchantProductNo_list'] =
        order.orderSkuList.skuList.map((sku) => sku.merchantProductNo || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_description_list'] =
        order.orderSkuList.skuList.map((sku) => sku.description || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_quantity_list'] =
        order.orderSkuList.skuList.map((sku) => sku.quantity || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_status_list'] =
        order.orderSkuList.skuList.map((sku) => sku.status || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_unitPriceInclVat_list'] =
        order.orderSkuList.skuList.map((sku) => sku.unitPriceInclVat || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_lineTotalInclVat_list'] =
        order.orderSkuList.skuList.map((sku) => sku.lineTotalInclVat || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_gtin_list'] = order.orderSkuList.skuList.map((sku) => sku.gtin || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_channelProductNo_list'] =
        order.orderSkuList.skuList.map((sku) => sku.channelProductNo || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_airWaybillNo_list'] =
        order.orderSkuList.skuList.map((sku) => sku.airWaybillNo || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_condition_list'] =
        order.orderSkuList.skuList.map((sku) => sku.condition || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_vatRate_list'] =
        order.orderSkuList.skuList.map((sku) => sku.vatRate || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_unitVat_list'] =
        order.orderSkuList.skuList.map((sku) => sku.unitVat || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_lineVat_list'] =
        order.orderSkuList.skuList.map((sku) => sku.lineVat || 'N/A').join(' | ') || 'N/A';
      flattened['skuList_expectedDeliveryDate_list'] =
        order.orderSkuList.skuList
          .map((sku) => {
            if (sku.expectedDeliveryDate) {
              const formatted = formatDateTime(sku.expectedDeliveryDate);
              return formatted ? `"${formatted.date} ${formatted.time}"` : sku.expectedDeliveryDate;
            }
            return 'N/A';
          })
          .join(' | ') || 'N/A';
      flattened['skuList_expectedShipmentDate_list'] =
        order.orderSkuList.skuList
          .map((sku) => {
            if (sku.expectedShipmentDate) {
              const formatted = formatDateTime(sku.expectedShipmentDate);
              return formatted ? `"${formatted.date} ${formatted.time}"` : sku.expectedShipmentDate;
            }
            return 'N/A';
          })
          .join(' | ') || 'N/A';
    } else {
      flattened['orderSkuList_skuList_count'] = 0;
      flattened['skuList_id_list'] = 'N/A';
      flattened['skuList_merchantProductNo_list'] = 'N/A';
      flattened['skuList_description_list'] = 'N/A';
      flattened['skuList_quantity_list'] = 'N/A';
      flattened['skuList_status_list'] = 'N/A';
      flattened['skuList_unitPriceInclVat_list'] = 'N/A';
      flattened['skuList_lineTotalInclVat_list'] = 'N/A';
      flattened['skuList_gtin_list'] = 'N/A';
      flattened['skuList_channelProductNo_list'] = 'N/A';
      flattened['skuList_airWaybillNo_list'] = 'N/A';
      flattened['skuList_condition_list'] = 'N/A';
      flattened['skuList_vatRate_list'] = 'N/A';
      flattened['skuList_unitVat_list'] = 'N/A';
      flattened['skuList_lineVat_list'] = 'N/A';
      flattened['skuList_expectedDeliveryDate_list'] = 'N/A';
      flattened['skuList_expectedShipmentDate_list'] = 'N/A';
    }
  }

  return flattened;
};

// Helper function to get headers for aggregated fields in specific order
export const getAggregatedOrderHeaders = (sampleOrder) => {
  // Order customer headers
  const customerHeaders = [];
  if (sampleOrder.orderCustomer) {
    Object.keys(sampleOrder.orderCustomer).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        customerHeaders.push(`orderCustomer_${key}`);
      }
    });
  }

  // Order payment details headers
  const paymentHeaders = [];
  if (sampleOrder.orderPaymentDetails) {
    Object.keys(sampleOrder.orderPaymentDetails).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        paymentHeaders.push(`orderPaymentDetails_${key}`);
      }
    });
  }

  // Shipping address headers
  const shippingHeaders = [];
  if (sampleOrder.orderShippingAddress) {
    Object.keys(sampleOrder.orderShippingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        shippingHeaders.push(`orderShippingAddress_${key}`);
      }
    });
  }

  // Billing address headers
  const billingHeaders = [];
  if (sampleOrder.orderBillingAddress) {
    Object.keys(sampleOrder.orderBillingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        billingHeaders.push(`orderBillingAddress_${key}`);
      }
    });
  }

  // SKU list headers
  const skuHeaders = [
    'orderSkuList_skuList_count',
    'skuList_id_list',
    'skuList_merchantProductNo_list',
    'skuList_description_list',
    'skuList_quantity_list',
    'skuList_status_list',
    'skuList_unitPriceInclVat_list',
    'skuList_lineTotalInclVat_list',
    'skuList_gtin_list',
    'skuList_channelProductNo_list',
    'skuList_airWaybillNo_list',
    'skuList_condition_list',
    'skuList_vatRate_list',
    'skuList_unitVat_list',
    'skuList_lineVat_list',
    'skuList_expectedDeliveryDate_list',
    'skuList_expectedShipmentDate_list',
  ];

  return {
    customerHeaders,
    paymentHeaders,
    shippingHeaders,
    billingHeaders,
    skuHeaders,
  };
};

// Helper function to get row data for organized headers
export const getOrganizedOrderRowData = (flattenedOrder, organizedHeaders) => {
  return organizedHeaders.map((header) => {
    const value = flattenedOrder[header];
    return formatValueForCSV(value, header);
  });
};

export default {
  sanitizeOrdersData,
  getPeriodDate,
  flattenAggregatedOrder,
  getAggregatedOrderHeaders,
  getOrganizedOrderRowData,
};
