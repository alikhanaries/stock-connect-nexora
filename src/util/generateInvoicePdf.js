import PDFDocument from 'pdfkit';
import { formatToInvoiceDate } from '#root/src/helpers/Common.js';
import Product from '#models/Product.js';
export const generateSellerInvoicePDF = async (res, data) => {
  const { invoiceData, sellerData, orderInfo, billingAddress } = data;

  const doc = new PDFDocument({
    margin: 40,
    bufferPages: true, // required for footer
  });

  const fileName = `${sellerData?.sellerName}_OrderInvoice--${orderInfo.channelOrderNumber}-${invoiceData.invoiceNumber}.pdf`;

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

  doc.font('Helvetica-Bold').text(billingAddress.companyName || 'ABCD');
  doc.font('Helvetica').text(name || 'Customer');

  if (billingAddress.line1) doc.text(billingAddress.line1);

  const cityLine = [billingAddress.city, billingAddress.state || billingAddress.region].filter(Boolean).join(', ');

  if (cityLine) doc.text(cityLine);
  if (billingAddress.city) doc.text(billingAddress.city);
  if (billingAddress.countryIso) doc.text(billingAddress.countryIso);

  doc.moveDown(1.5);

  // ================= INVOICE DETAILS =================
  const formattedOrderDate = formatToInvoiceDate(orderInfo.orderDate);

  const drawDetailRow = (label, value, isLast = false) => {
    const paddingTop = 4; // space from top
    const rowHeight = 22; // total row height
    const lineOffset = 18; // divider position

    const baseY = doc.y;
    const textY = baseY + paddingTop;

    // Label (bold)
    doc.font('Helvetica-Bold').text(label, 40, textY);

    // Value (normal)
    doc.font('Helvetica').text(value, 200, textY);

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

  drawDetailRow('Invoice number', invoiceData.invoiceNumber);
  drawDetailRow('Order number', orderInfo.channelOrderNumber);
  drawDetailRow('Order date', formattedOrderDate);
  drawDetailRow('Invoice date', invoiceData.invoiceDate, true); // last row
  doc.moveDown(2);

  // ================= TABLE HEADER =================
  let tableY = doc.y;

  const cols = {
    desc: 45,
    qty: 270,
    price: 310,
    vatP: 360,
    vat: 390,
    exVat: 440,
    total: 500,
  };

  const headerHeight = 22;

  // Background
  doc.rect(40, tableY - 5, 530, headerHeight).fill('#f2f2f2');

  doc.fillColor('#000').font('Helvetica-Bold').fontSize(10);

  //  center text vertically
  const textY = tableY - 5 + (headerHeight - 10) / 2;

  doc.text('Description', cols.desc, textY);

  doc.text('Quantity', cols.qty, textY, { width: 50, align: 'right' });
  doc.text('Price', cols.price, textY, { width: 50, align: 'right' });
  doc.text('VAT %', cols.vatP, textY, { width: 40, align: 'right' });
  doc.text('VAT', cols.vat, textY, { width: 50, align: 'right' });
  doc.text('Ex. VAT', cols.exVat, textY, { width: 50, align: 'right' });
  doc.text('Line total', cols.total, textY, { width: 50, align: 'right' });

  // ================= TABLE ROWS =================
  let yPos = tableY + 25;

  const skuCodes = sellerData.skus.map((s) => s.merchantProductNo);

  const products = await Product.find({
    productSkuCode: { $in: skuCodes },
  }).lean();

  const productMap = {};

  products.forEach((p) => {
    productMap[p.productSkuCode] = p;
  });

  sellerData.skus.forEach((sku, index) => {
    const product = productMap[sku.merchantProductNo] || {};

    const color = product.color || '-';
    const size = product.size || '-';
    const desc = `${sku.description || ''}
    Color: ${color || '-'} | Size: ${size || '-'}
    GTIN: ${sku.gtin || '-'}
    Merchant product number: ${sku.merchantProductNo || '-'}`;

    const descHeight = doc.heightOfString(desc, { width: 220 });

    doc.text(desc, cols.desc, yPos, { width: 220 });

    doc.text(sku.quantity?.toString() || '0', cols.qty, yPos, { width: 50, align: 'right' });
    doc.text((sku.unitPriceInclVat || 0).toFixed(2), cols.price, yPos, { width: 50, align: 'right' });
    doc.text((sku.vatRate || 0).toFixed(2), cols.vatP, yPos, { width: 40, align: 'right' });
    doc.text((sku.lineVat || 0).toFixed(2), cols.vat, yPos, { width: 50, align: 'right' });
    doc.text((sku.lineTotalExclVat || 0).toFixed(2), cols.exVat, yPos, { width: 50, align: 'right' });
    doc.text((sku.lineTotalInclVat || 0).toFixed(2), cols.total, yPos, { width: 50, align: 'right' });

    const nextY = yPos + descHeight + 10;

    // Skip border for last item
    if (index !== sellerData.skus.length - 1) {
      doc
        .moveTo(40, nextY - 5)
        .lineTo(570, nextY - 5)
        .strokeColor('#eeeeee')
        .lineWidth(0.5)
        .stroke();
    }

    yPos = nextY;
  });

  // ================= TOTALS =================
  const t = sellerData.totals;

  //  Add top margin before totals
  yPos += 10;

  // Top divider (optional)
  doc.moveTo(40, yPos).lineTo(570, yPos).strokeColor('#cccccc').lineWidth(1).stroke();

  // spacing after divider
  yPos += 12;

  const drawTotal = (label, value) => {
    const paddingTop = 4; //  space from top
    const rowHeight = 22; //  total row height
    const lineOffset = 18; //  divider position

    const currentY = yPos + paddingTop;

    doc.font('Helvetica-Bold');

    // Label
    doc.text(label, 420, currentY);

    // Value
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

    // Move to next row
    yPos += rowHeight;
  };

  drawTotal('Subtotal', (t.subTotalExclVat || 0).toFixed(2));
  drawTotal('VAT', (t.vat || 0).toFixed(2));
  drawTotal('Total', (t.subTotalInclVat || 0).toFixed(2));
  drawTotal('Shipping', (t.shippingInclVat || 0).toFixed(2));
  drawTotal('Order Total', (t.grandTotal || 0).toFixed(2), true);

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
      .text(`${i + 1} / ${range.count}`, 0, footerY + 8, {
        width: pageWidth,
        align: 'center',
      });
  }

  doc.end();
};
