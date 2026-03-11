export const validateFullShipmentProducts = (orderSkuList = [], products = []) => {
  if (!Array.isArray(orderSkuList) || !orderSkuList.length) {
    return { success: false, message: 'Order has no SKU items.' };
  }

  if (!Array.isArray(products) || !products.length) {
    return { success: false, message: 'Shipment products are required.' };
  }

  const orderSkuMap = new Map();

  // Build map with only shippable lines
  for (const sku of orderSkuList) {
    const orderedQty = Number(sku.quantity || 0);
    const cancelledQty = Number(sku.cancellationRequestedQuantity || 0);
    const shippableQty = orderedQty - cancelledQty;

    if (shippableQty > 0) {
      orderSkuMap.set(sku.merchantProductNo, shippableQty);
    }
  }

  const shippableSkuCount = orderSkuMap.size;

  // Ensure shipment only contains shippable items
  if (products.length !== shippableSkuCount) {
    return {
      success: false,
      message: 'Partial shipment not allowed. All shippable order products must be included.',
    };
  }

  for (const product of products) {
    const orderQty = orderSkuMap.get(product.merchantProductNo);

    if (orderQty === undefined) {
      return {
        success: false,
        message: `Product ${product.merchantProductNo} is not shippable or not found in order.`,
      };
    }

    const requestQty = Number(product.quantity || 0);

    if (requestQty !== orderQty) {
      return {
        success: false,
        message: `Partial shipment not allowed for ${product.merchantProductNo}. Shippable quantity is ${orderQty}, but received ${requestQty}.`,
      };
    }
  }

  return { success: true };
};
