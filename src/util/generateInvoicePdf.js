import PDFDocument from 'pdfkit';
import { formatToInvoiceDate } from '#root/src/helpers/Common.js';
import Product from '#models/Product.js';
const simpleNumericHash = (str) => {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0; // unsigned int
  }

  return hash;
};
export const generateSellerInvoiceNumber = (sellerData, orderInfo, invoiceData) => {
  const baseString =
    (sellerData?.sellerCode || sellerData?.sellerName || 'SELLER') +
    '|' +
    (orderInfo?.channelOrderNumber || orderInfo?.orderId || '') +
    '|' +
    (invoiceData?.invoiceNumber || '');

  const hash = simpleNumericHash(baseString);

  return `INV${hash.toString().slice(0, 10)}`;
};
export const generateSellerInvoicePDF = async (res, data) => {
  const { invoiceData, sellerData, orderInfo, billingAddress } = data;

  const doc = new PDFDocument({
    margin: 40,
    bufferPages: true, // required for footer
  });

  const channelEngineInvoiceId = invoiceData.invoiceNumber;
  // OR whatever you already receive from ChannelEngine

  const sellerInvoiceId = generateSellerInvoiceNumber(sellerData, orderInfo, invoiceData);
  const fileName = `${sellerData?.sellerName}_OrderInvoice--${sellerInvoiceId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  doc.pipe(res);

  // ================= HEADER =================
  const headerY = 40;

  doc.font('Helvetica-Bold').fontSize(18);
  doc.text('Invoice', 40, headerY);

  doc.text((sellerData?.sellerName || '').toUpperCase(), 40, headerY, {
    width: 520,
    align: 'right',
  });

  const lineY = headerY + 25;
  doc.moveTo(40, lineY).lineTo(570, lineY).strokeColor('#cccccc').lineWidth(1).stroke();

  doc.y = lineY + 15;

  // ================= CUSTOMER =================
  doc.fontSize(10);

  const name = `${billingAddress.firstName || ''} ${billingAddress.lastName || ''}`.trim();

  if (billingAddress.companyName) {
    // Show company name in bold
    doc.font('Helvetica-Bold').text(billingAddress.companyName);

    // Show customer name in normal
    doc.font('Helvetica').text(name || 'Customer');
  } else {
    // No company → show name in bold only
    doc.font('Helvetica-Bold').text(name || 'Customer');
  }

  if (billingAddress.line1) doc.font('Helvetica').text(billingAddress.line1);

  const cityLine = [billingAddress.city, billingAddress.state || billingAddress.region].filter(Boolean).join(', ');

  if (cityLine) doc.font('Helvetica').text(cityLine);

  if (billingAddress.city) doc.font('Helvetica').text(billingAddress.city);

  if (billingAddress.countryIso) doc.font('Helvetica').text(billingAddress.countryIso);

  doc.moveDown(1.5);

  // ================= INVOICE DETAILS =================
  const formattedOrderDate = formatToInvoiceDate(orderInfo.orderDate);
  const formattedInvoiceDate = formatToInvoiceDate(invoiceData.invoiceDate);
  const drawDetailRow = (label, value, isLast = false) => {
    const paddingTop = 4; // space from top
    const rowHeight = 22; // total row height
    const lineOffset = 18; // divider position

    const baseY = doc.y;
    const textY = baseY + paddingTop;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

    doc.text(label, 40, textY);

    doc.font('Helvetica').fontSize(10).fillColor('#000');

    doc.text(value, 200, textY);

    // Skip divider for last row
    if (!isLast) {
      doc
        .moveTo(40, baseY + lineOffset)
        .lineTo(570, baseY + lineOffset)
        .strokeColor('#e6e6e6')
        .lineWidth(0.7)
        .stroke();
    }

    // Move cursor
    doc.y = baseY + rowHeight;
  };

  drawDetailRow('Invoice number', channelEngineInvoiceId);
  drawDetailRow('Brand Invoice number', sellerInvoiceId);
  drawDetailRow('Order number', orderInfo.channelOrderNumber);
  drawDetailRow('Order date', formattedOrderDate);
  drawDetailRow('Invoice date', formattedInvoiceDate, true); // last row
  doc.moveDown(2);

  // ================= TABLE HEADER =================
  const cols = {
    desc: 45,
    qty: 245,
    price: 305,
    vatP: 355,
    vat: 395,
    exVat: 450,
    total: 510,
  };

  let yPos = doc.y;

  const drawTableHeader = () => {
    const headerHeight = 22;

    doc.save();

    doc.rect(40, yPos - 5, 530, headerHeight).fill('#f2f2f2');

    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10);

    const textY = yPos - 5 + (headerHeight - 10) / 2;

    doc.text('Description', cols.desc, textY);

    doc.text('Quantity', cols.qty, textY, {
      width: 50,
      align: 'right',
    });

    doc.text('Price', cols.price, textY, {
      width: 50,
      align: 'right',
    });

    doc.text('VAT %', cols.vatP, textY, {
      width: 40,
      align: 'right',
    });

    doc.text('VAT', cols.vat, textY, {
      width: 50,
      align: 'right',
    });

    doc.text('Ex. VAT', cols.exVat, textY, {
      width: 50,
      align: 'right',
    });

    doc.text('Line total', cols.total, textY, {
      width: 50,
      align: 'right',
    });

    doc.restore();

    yPos += 25;
  };

  drawTableHeader();

  // ================= TABLE ROWS =================
  const skuCodes = sellerData.skus.map((s) => s.merchantProductNo);

  const products = await Product.find({
    productSkuCode: { $in: skuCodes },
  }).lean();

  const productMap = {};

  products.forEach((p) => {
    productMap[p.productSkuCode] = p;
  });

  sellerData.skus.forEach((sku, index) => {
    // FORCE NORMAL TEXT EVERY ROW
    doc.font('Helvetica').fontSize(10).fillColor('#000');

    const product = productMap[sku.merchantProductNo] || {};

    const color = product.color || '-';
    const size = product.size || '-';

    const desc = `${sku.description || ''}
Color: ${color || '-'} | Size: ${size || '-'}
GTIN: ${sku.gtin || '-'}
MPN: ${sku.merchantProductNo || '-'}`;

    const descHeight = doc.heightOfString(desc, { width: 220 });

    const rowHeight = Math.max(descHeight, 40);

    // ================= PAGE BREAK =================
    if (yPos + rowHeight > doc.page.height - 120) {
      doc.addPage();

      yPos = 60;

      drawTableHeader();

      // IMPORTANT RESET AFTER HEADER
      doc.font('Helvetica');
      doc.fontSize(10);
      doc.fillColor('#000');
    }

    // FORCE NORMAL AGAIN
    doc.font('Helvetica').fontSize(10).fillColor('#000');

    // ================= ROW =================
    doc.text(desc, cols.desc, yPos, {
      width: 220,
    });

    doc.text(sku.quantity?.toString() || '0', cols.qty, yPos, {
      width: 50,
      align: 'right',
    });

    doc.text((sku.unitPriceInclVat || 0).toFixed(2), cols.price, yPos, {
      width: 50,
      align: 'right',
    });

    doc.text((sku.vatRate || 0).toFixed(2), cols.vatP, yPos, {
      width: 40,
      align: 'right',
    });

    doc.text((sku.lineVat || 0).toFixed(2), cols.vat, yPos, {
      width: 50,
      align: 'right',
    });

    doc.text((sku.lineTotalExclVat || 0).toFixed(2), cols.exVat, yPos, {
      width: 50,
      align: 'right',
    });

    doc.text((sku.lineTotalInclVat || 0).toFixed(2), cols.total, yPos, {
      width: 50,
      align: 'right',
    });

    yPos += rowHeight + 10;

    if (index !== sellerData.skus.length - 1) {
      doc
        .moveTo(40, yPos - 5)
        .lineTo(570, yPos - 5)
        .strokeColor('#eeeeee')
        .lineWidth(0.5)
        .stroke();
    }
  });

  // ================= TOTALS =================
  const t = sellerData.totals;

  yPos += 10;

  // page break before totals
  if (yPos + 140 > doc.page.height - 120) {
    doc.addPage();
    yPos = 60;
  }

  doc.moveTo(40, yPos).lineTo(570, yPos).strokeColor('#cccccc').lineWidth(1).stroke();

  // spacing after divider
  yPos += 12;

  const drawTotal = (label, value) => {
    const paddingTop = 4;
    const rowHeight = 22;
    const lineOffset = 18;

    const currentY = yPos + paddingTop;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

    doc.text(label, 420, currentY);

    doc.font('Helvetica').fontSize(10).fillColor('#000');

    doc.text(value, 510, currentY, {
      width: 50,
      align: 'right',
    });

    // Divider (skip for Order Total)
    if (label !== 'Order Total') {
      doc
        .moveTo(40, yPos + lineOffset)
        .lineTo(570, yPos + lineOffset)
        .strokeColor('#e6e6e6')
        .lineWidth(0.7)
        .stroke();
    }

    yPos += rowHeight;
  };
  drawTotal('Subtotal', (t.subTotalExclVat || 0).toFixed(2));
  drawTotal('VAT', (t.vat || 0).toFixed(2));
  drawTotal('Total', (t.subTotalInclVat || 0).toFixed(2));
  drawTotal('Shipping', (t.shippingInclVat || 0).toFixed(2));

  drawTotal('Order Total', (t.grandTotal || 0).toFixed(2));

  // ================= FOOTER =================
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    const footerY = pageHeight - 80;

    // Divider line
    doc
      .moveTo(5, footerY)
      .lineTo(pageWidth - 40, footerY)
      .strokeColor('#e0e0e0')
      .lineWidth(0.7)
      .stroke();

    // Page number BELOW line
    doc
      .fontSize(9)
      .fillColor('#555')
      .font('Helvetica')
      .text(`${i + 1} / ${range.count}`, 0, footerY + 8, {
        width: pageWidth,
        align: 'center',
      });
  }

  doc.end();
};
