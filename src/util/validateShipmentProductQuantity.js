export const validateFullShipmentProducts = (orderSkuList = [], products = []) => {
  if (!Array.isArray(orderSkuList) || !orderSkuList.length) {
    return { success: false, message: 'Order has no SKU items.' };
  }

  if (!Array.isArray(products) || !products.length) {
    return { success: false, message: 'Shipment products are required.' };
  }

  // Map order SKUs by merchantProductNo
  const orderSkuMap = new Map();
  for (const sku of orderSkuList) {
    orderSkuMap.set(sku.merchantProductNo, Number(sku.quantity || 0));
  }

  // Ensure product count matches order SKU count
  if (products.length !== orderSkuList.length) {
    return {
      success: false,
      message: 'Partial shipment not allowed. All order products must be included.',
    };
  }

  // Validate each product
  for (const product of products) {
    const orderQty = orderSkuMap.get(product.merchantProductNo);

    if (orderQty === undefined) {
      return {
        success: false,
        message: `Product ${product.merchantProductNo} not found in order.`,
      };
    }

    const requestQty = Number(product.quantity || 0);

    if (orderQty !== requestQty) {
      return {
        success: false,
        message: `Partial shipment not allowed for ${product.merchantProductNo}. Order quantity is ${orderQty}, but received ${requestQty}.`,
      };
    }
  }

  return { success: true };
};
