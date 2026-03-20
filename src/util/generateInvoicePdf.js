import PDFDocument from 'pdfkit';
import { formatToInvoiceDate } from '#root/src/helpers/Common.js';
export const generateSellerInvoicePDF = (res, data) => {
  const { invoiceData, sellerData, orderInfo, billingAddress } = data;

  const doc = new PDFDocument({ margin: 40 });

  const fileName = `${sellerData?.sellerName}_OrderInvoice--${orderInfo.channelOrderNumber}-${invoiceData.invoiceNumber}-${orderInfo?.orderId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);

  // ================= HEADER =================
  doc.fontSize(16).text(`Invoice ${sellerData?.sellerName?.toUpperCase()}`);
  doc.moveDown();

  const name = `${billingAddress.firstName || ''} ${billingAddress.lastName || ''}`.trim();

  doc.fontSize(10);

  doc.text(name || 'Customer');

  if (billingAddress.line1) doc.text(billingAddress.line1);

  const cityLine = [billingAddress.city, billingAddress.state || billingAddress.region].filter(Boolean).join(', ');

  if (cityLine) doc.text(cityLine);

  if (billingAddress.postalCode) doc.text(billingAddress.postalCode);

  if (billingAddress.countryIso) doc.text(billingAddress.countryIso);
  const formattedOrderDate = formatToInvoiceDate(orderInfo.orderDate);

  // Right side
  doc.moveUp(5);
  doc.text(`Invoice number: ${invoiceData.invoiceNumber}`, { align: 'right' });
  doc.text(`Order number: ${orderInfo.channelOrderNumber}`, { align: 'right' });

  doc.text(`Order date: ${formattedOrderDate}`, {
    align: 'right',
  });
  doc.text(`Invoice date: ${invoiceData.invoiceDate}`, {
    align: 'right',
  });

  doc.moveDown(2);

  // ================= TABLE HEADER =================
  const startY = doc.y;

  const cols = {
    id: 40,
    desc: 80,
    qty: 260,
    price: 310,
    vatP: 370,
    vat: 410,
    exVat: 470,
    total: 525,
  };
  doc.font('Helvetica-Bold');
  doc.text('Id', cols.id, startY);
  doc.text('Description', cols.desc, startY);
  doc.text('Qty', cols.qty, startY);
  doc.text('Price', cols.price, startY);
  doc.text('VAT %', cols.vatP, startY);
  doc.text('VAT', cols.vat, startY);
  doc.text('Ex VAT', cols.exVat, startY);
  doc.text('Line Total', cols.total, startY);

  doc
    .moveTo(40, startY + 15)
    .lineTo(570, startY + 15)
    .stroke();

  doc.font('Helvetica');

  // ================= TABLE ROWS =================
  let y = startY + 25;

  sellerData.skus.forEach((sku) => {
    doc.text(sku.id.toString(), cols.id, y);
    const descHeight = doc.heightOfString(
      `${sku.description || ''}\nGTIN: ${sku.gtin || '-'}\nMPN: ${sku.merchantProductNo || '-'}`,
      { width: 150 }
    );

    doc.text(`${sku.description || ''}\nGTIN: ${sku.gtin || '-'}\nMPN: ${sku.merchantProductNo || '-'}`, cols.desc, y, {
      width: 150,
    });

    doc.text(sku.quantity.toString(), cols.qty, y);
    doc.text(sku.unitPriceInclVat.toFixed(2), cols.price, y);
    doc.text((sku.vatRate || 0).toFixed(2), cols.vatP, y);
    doc.text((sku.lineVat || 0).toFixed(2), cols.vat, y);
    doc.text((sku.lineTotalExclVat || 0).toFixed(2), cols.exVat, y);
    doc.text((sku.lineTotalInclVat || 0).toFixed(2), cols.total, y);

    y += descHeight + 10;
  });

  // ================= TOTALS =================
  const t = sellerData.totals;

  doc.moveDown(5);

  // Divider
  doc.moveTo(40, doc.y).lineTo(580, doc.y).strokeColor('#cccccc').stroke();

  doc.moveDown();

  // Align with table columns
  const labelX = 420;
  const valueX = cols.total; // align with "Line Total" column

  const rowHeight = 18;

  // FIXED drawRow (same line rendering)
  const drawRow = (label, value, bold = false) => {
    const currentY = doc.y; // lock Y

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');

    // Label
    doc.text(label, labelX, currentY);

    // Value (same Y, right aligned)
    doc.text(value, valueX, currentY, {
      width: 60,
      align: 'right',
    });

    // Move to next row manually
    doc.y = currentY + rowHeight;
  };

  // Rows
  drawRow('Subtotal', t.subTotalExclVat.toFixed(2));
  drawRow('VAT', t.vat.toFixed(2));
  drawRow('Total', t.subTotalInclVat.toFixed(2));
  drawRow('Shipping', t.shippingInclVat.toFixed(2));
  drawRow('Order Total', t.grandTotal.toFixed(2), true);
  doc.end();
};
