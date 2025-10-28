import pdfjsLib from 'pdfjs-dist/build/pdf.js';
import Order from '#models/Orders.js';

export const parseInvoiceData = async (orderId) => {
  try {
    // 1️ Fetch order
    const orderData = await Order.findOne({ _id: orderId }, { merchantOrderNo: 1 }).lean();
    if (!orderData) return { success: false, message: 'No order found for this order id' };

    const { merchantOrderNo } = orderData;
    const url = `${process.env.CHANNEL_ENGINE_BASE_URL}orders/${merchantOrderNo}/invoice?apiKey=${process.env.CHANNEL_ENGINE_API_KEY}`;

    // 2️ Fetch PDF from ChannelEngine
    const response = await fetch(url, { headers: { Accept: 'application/pdf' } });
    if (!response.ok) throw new Error(`Failed to fetch invoice: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3️ Parse PDF using pdfjs-dist (in-memory)
    const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;

    let rawText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      rawText += strings.join(' ') + ' ';
    }

    // 4️ Clean text
    let cleaned = rawText
      .replace(/[^\w/:.\-\s]/g, ' ') // removed unnecessary escapes
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([A-Z])\s(?=[A-Z])/g, '$1') // join split capitals
      .replace(/(\d)\s(?=\d)/g, '$1'); // join split numbers

    // 5️ Extract invoice number (e.g., CE-12345-678)
    const invMatch = cleaned.match(/\b[A-Z]{1,5}(?:-[A-Z0-9]+){1,3}\b/i);
    const invoiceNumber = invMatch ? invMatch[0] : null;

    // 6️ Extract invoice date (MM/DD/YYYY HH:MM:SS)
    const dateMatch = cleaned.match(/\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}:\d{2}/);
    const invoiceDate = dateMatch ? dateMatch[0].replace(/\s+/g, ' ') : null;

    // 7️ Hardcoded tax number (you can replace with actual extraction)
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
