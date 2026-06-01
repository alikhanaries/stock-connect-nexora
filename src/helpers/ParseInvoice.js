import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import Order from '#models/Orders.js';

const require = createRequire(import.meta.url);

const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export const parseInvoiceData = async (orderId) => {
  try {
    // 1️ Fetch order from DB
    const orderData = await Order.findOne({ _id: orderId }, { merchantOrderNo: 1 }).lean();

    if (!orderData) return { success: false, message: 'No order found for this order id' };

    const { merchantOrderNo } = orderData;
    const url = `${process.env.CHANNEL_ENGINE_BASE_URL}orders/${merchantOrderNo}/invoice?apiKey=${process.env.CHANNEL_ENGINE_API_KEY}`;

    // 2️ Fetch PDF from ChannelEngine
    const response = await fetch(url, { headers: { Accept: 'application/pdf' } });
    if (!response.ok) throw new Error(`Failed to fetch invoice: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // 3️ Extract text from all pages
    let rawText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      rawText += strings.join(' ') + '\n';
    }

    // 4️ Clean and normalize text
    const cleaned = rawText
      .replace(/[^\w/:.\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([A-Z])\s(?=[A-Z])/g, '$1')
      .replace(/(\d)\s(?=\d)/g, '$1');

    // 5️ Extract invoice number (e.g. CE-12345-678)
    const invMatch = cleaned.match(/\b[A-Z]{1,5}(?:-[A-Z0-9]+){1,3}\b/i);
    const invoiceNumber = invMatch ? invMatch[0] : null;

    // 6️ Extract invoice date
    const dateMatch =
      cleaned.match(/\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}:\d{2}/) ||
      cleaned.match(/\d{4}-\d{2}-\d{2}/) ||
      cleaned.match(/\d{2}\/\d{2}\/\d{4}/);
    const invoiceDate = dateMatch ? dateMatch[0].replace(/\s+/g, ' ') : null;

    // 7️ Hardcoded tax number (placeholder)
    const taxIdentificationNumber = '1234567';

    return {
      success: true,
      orderId,
      merchantOrderNo,
      invoiceData: { invoiceNumber, invoiceDate, taxIdentificationNumber },
    };
  } catch (err) {
    console.error('Error parsing invoice PDF:', err);
    return { success: false, message: err.message || 'Internal server error.' };
  }
};

export const parseInvoiceDataForGenerateSellerInvoice = async (orderId, sellerId, seller) => {
  try {
    if (!orderId) {
      return { success: false, message: 'Order ID is required' };
    }

    if (!sellerId) {
      return { success: false, message: 'Seller ID is required' };
    }

    //  Fetch full order
    const orderData = await Order.findById(orderId).lean();

    if (!orderData) {
      return { success: false, message: 'No order found for this order id' };
    }

    const { merchantOrderNo } = orderData;

    //  Filter seller-specific SKUs (SAFE compare)
    const sellerSkus =
      orderData.orderSkuList?.skuList?.filter((sku) => String(sku.sellerId) === String(sellerId)) || [];

    if (!sellerSkus.length) {
      return { success: false, message: 'No SKUs found for this seller' };
    }

    //  Calculate totals
    const totals = sellerSkus.reduce(
      (acc, sku) => {
        acc.qty += sku.quantity || 0;
        acc.subTotalInclVat += sku.lineTotalInclVat || 0;
        acc.subTotalExclVat += sku.lineTotalExclVat || 0;
        acc.vat += sku.lineVat || 0;
        return acc;
      },
      {
        qty: 0,
        subTotalInclVat: 0,
        subTotalExclVat: 0,
        vat: 0,
      }
    );

    //  Proportional shipping
    const ratio = orderData.subTotalInclVat > 0 ? totals.subTotalInclVat / orderData.subTotalInclVat : 0;

    const shippingInclVat = (orderData.shippingCostsInclVat || 0) * ratio;
    const shippingVat = (orderData.shippingCostsVat || 0) * ratio;

    const grandTotal = totals.subTotalInclVat + shippingInclVat;

    //  Fetch & parse ChannelEngine invoice
    let invoiceNumber = null;
    let invoiceDate = null;

    try {
      const url = `${process.env.CHANNEL_ENGINE_BASE_URL}orders/${merchantOrderNo}/invoice?apiKey=${process.env.CHANNEL_ENGINE_API_KEY}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/pdf' },
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let rawText = '';

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          rawText += content.items.map((item) => item.str).join(' ') + '\n';
        }

        const cleaned = rawText
          .replace(/[^\w/:.\-\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Better invoice number detection
        const invMatch = cleaned.match(/Invoice number\s*[:-]?\s*([A-Z0-9-]+)/i) || cleaned.match(/CE-[A-Z0-9-]+/i);

        invoiceNumber = invMatch ? invMatch[1] || invMatch[0] : null;

        // Better date extraction
        const dateMatch = cleaned.match(/Invoice date\s*[:-]?\s*([\d/:\s-]+)/i) || cleaned.match(/\d{2}\/\d{2}\/\d{4}/);

        invoiceDate = dateMatch ? dateMatch[1]?.trim() || dateMatch[0] : null;
      }
    } catch (err) {
      console.warn('Invoice PDF parsing failed, continuing without metadata:', err.message);
    }

    // Final structured response
    return {
      success: true,
      orderId,
      merchantOrderNo,

      invoiceData: {
        invoiceNumber: invoiceNumber || merchantOrderNo, // fallback
        invoiceDate: invoiceDate || new Date(orderData.orderDate).toISOString(),
        taxIdentificationNumber: '1234567', // TODO: dynamic later
        currency: 'SAR',
      },

      sellerData: {
        sellerName: seller?.name,
        sellerId,
        skus: sellerSkus,
        totals: {
          qty: totals.qty,
          subTotalInclVat: Number(totals.subTotalInclVat.toFixed(2)),
          subTotalExclVat: Number(totals.subTotalExclVat.toFixed(2)),
          vat: Number(totals.vat.toFixed(2)),
          shippingInclVat: Number(shippingInclVat.toFixed(2)),
          shippingVat: Number(shippingVat.toFixed(2)),
          grandTotal: Number(grandTotal.toFixed(2)),
        },
      },

      customer: orderData.orderCustomer || {},
      billingAddress: orderData.orderBillingAddress || {},
      shippingAddress: orderData.orderShippingAddress || {},

      orderInfo: {
        orderDate: orderData.orderDate,
        channelOrderNumber: orderData.channelOrderNumber,
        channelName: orderData.channelName,
        orderId: orderData?.orderId,
      },
    };
  } catch (err) {
    console.error('Error in parseInvoiceDataForGenerateSellerInvoice:', err);

    return {
      success: false,
      message: err.message || 'Internal server error',
    };
  }
};
