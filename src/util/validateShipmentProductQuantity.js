export const validateFullShipmentProducts = (orderSkuList = [], products = []) => {
  if (!Array.isArray(orderSkuList) || !orderSkuList.length) {
    return { success: false, message: 'Order has no SKU items.' };
  }

  if (!Array.isArray(products) || !products.length) {
    return { success: false, message: 'Shipment products are required.' };
  }

  // Build map of all order SKUs with shippable quantities
  const orderSkuMap = new Map();
  for (const sku of orderSkuList) {
    const orderedQty = Number(sku.quantity || 0);
    const cancelledQty = Number(sku.cancellationRequestedQuantity || 0);
    const shippableQty = orderedQty - cancelledQty;

    if (shippableQty > 0) {
      orderSkuMap.set(sku.merchantProductNo, shippableQty);
    }
  }

  // Validate only products in input
  for (const product of products) {
    const orderQty = orderSkuMap.get(product.merchantProductNo);

    const requestQty = Number(product.quantity || 0);

    if (orderQty === undefined) {
      return {
        success: false,
        message: `Product ${product.merchantProductNo} is not shippable or not found in order.`,
      };
    }

    if (requestQty !== orderQty) {
      return {
        success: false,
        message: `Partial shipment not allowed for ${product.merchantProductNo}. Shippable quantity is ${orderQty}, but received ${requestQty}.`,
      };
    }
  }

  return { success: true };
};
