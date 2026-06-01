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
