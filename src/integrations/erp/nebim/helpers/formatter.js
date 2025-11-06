import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';

export const formatNebimProducts = async (raw = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  // Group by ItemCode (SKU family)
  const groupedByItemCode = raw.reduce((acc, item) => {
    if (!item?.ItemCode) return acc;
    const code = String(item.ItemCode).trim();
    if (!acc[code]) acc[code] = [];
    acc[code].push(item);
    return acc;
  }, {});

  let itemGroups = Object.entries(groupedByItemCode);

  /**
   * TODO: Remove this limit once full import is ready for production.
   * This is just to avoid processing too many products during testing.
   */

  itemGroups = itemGroups.slice(0, 20);

  const formattedProducts = [];

  // Process each SKU family in batches
  await processInBatches(itemGroups, batchSize, async (batch) => {
    for (const [itemCode, items] of batch) {
      const first = items[0];

      // GRANDPARENT PRODUCT
      const grandParentSku = itemCode;
      const grandParentProduct = await canonicalProductMapper(
        {
          sellerId,
          grandParentProductSkuCode: null,
          parentProductSkuCode: null,
          productSkuCode: grandParentSku,
          name: first.ItemName || '',
          nameAr: first.ItemName || '',
          description: first.ItemDesc || '',
          descriptionAr: first.ItemDesc || '',
          brand: first.BrandDesc || '',
          color: '',
          size: '',
          ean: '',
          categoryTrail: `${first.Cat01Desc || ''} > ${first.Cat02Desc || ''}`.trim(),
          price: Number(first.Price) || 0,
          minPrice: Number(first.Price) || 0,
          maxPrice: Number(first.Price) || 0,
          msrp: Number(first.Price) || 0,
          purchasePrice: Number(first.Price) || 0,
          shippingCost: 0,
          shippingTime: 0,
          currentStockCount: Number(first.Qty) || 0,
          volumetricWeightCm: 0,
          hsCodeAE: '1111111',
          hsCodeSA: '1111111',
          primaryImageUrl: first.ImageUrl || '',
          imageUrl: first.ImageUrl || '',
          vatRateType: 'STANDARD',
          productType: 'configurable',
        },
        sellerId
      );
      formattedProducts.push(grandParentProduct);

      // PARENT — Group by Color
      const groupedByColor = items.reduce((acc, item) => {
        const color = item.ColorDesc?.trim() || 'NO_COLOR';
        if (!acc[color]) acc[color] = [];
        acc[color].push(item);
        return acc;
      }, {});

      for (const [colorDesc, colorItems] of Object.entries(groupedByColor)) {
        const colorFirst = colorItems[0];
        const safeColor = colorDesc.replace(/\s+/g, '_').toUpperCase();
        const parentSku = `${itemCode}-${safeColor}`;

        const parentProduct = await canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: grandParentSku,
            parentProductSkuCode: null,
            productSkuCode: parentSku,
            name: `${colorFirst.ItemName || ''} - ${colorDesc}`,
            nameAr: colorFirst.ItemName || '',
            description: colorFirst.ItemDesc || '',
            descriptionAr: colorFirst.ItemDesc || '',
            brand: colorFirst.BrandDesc || '',
            color: colorDesc,
            size: '',
            ean: '',
            categoryTrail: `${colorFirst.Cat01Desc || ''} > ${colorFirst.Cat02Desc || ''}`.trim(),
            price: Number(colorFirst.Price) || 0,
            minPrice: Number(colorFirst.Price) || 0,
            maxPrice: Number(colorFirst.Price) || 0,
            msrp: Number(colorFirst.Price) || 0,
            purchasePrice: Number(colorFirst.Price) || 0,
            shippingCost: 0,
            shippingTime: 0,
            currentStockCount: Number(colorFirst.Qty) || 0,
            volumetricWeightCm: 0,
            hsCodeAE: '1111111',
            hsCodeSA: '1111111',
            primaryImageUrl: colorFirst.ImageUrl || '',
            imageUrl: colorFirst.ImageUrl || '',
            vatRateType: 'STANDARD',
            productType: 'configurable',
          },
          sellerId
        );
        formattedProducts.push(parentProduct);

        // CHILDREN — Each Size Variant
        for (const variant of colorItems) {
          const sizeCode = variant.ItemDim1Desc?.trim() || variant.ItemDim1Code || 'NOSIZE';
          const safeSize = sizeCode.replace(/\s+/g, '_').toUpperCase();
          const childSku = `${parentSku}-${safeSize}`;

          const childProduct = await canonicalProductMapper(
            {
              sellerId,
              grandParentProductSkuCode: null,
              parentProductSkuCode: parentSku,
              productSkuCode: childSku,
              name: `${variant.ItemName || ''} - ${colorDesc} - ${sizeCode}`,
              nameAr: variant.ItemName || '',
              description: variant.ItemDesc || '',
              descriptionAr: variant.ItemDesc || '',
              brand: variant.BrandDesc || '',
              color: colorDesc,
              size: sizeCode,
              ean: variant.Barcode || '',
              categoryTrail: `${variant.Cat01Desc || ''} > ${variant.Cat02Desc || ''}`.trim(),
              price: Number(variant.Price) || 0,
              minPrice: Number(variant.Price) || 0,
              maxPrice: Number(variant.Price) || 0,
              msrp: Number(variant.Price) || 0,
              purchasePrice: Number(variant.Price) || 0,
              shippingCost: 0,
              shippingTime: 0,
              currentStockCount: Number(variant.Qty) || 0,
              volumetricWeightCm: 0,
              hsCodeAE: '1111111',
              hsCodeSA: '1111111',
              primaryImageUrl: variant.ImageUrl || '',
              imageUrl: variant.ImageUrl || '',
              vatRateType: 'STANDARD',
              productType: 'simple',
            },
            sellerId
          );

          formattedProducts.push(childProduct);
        }
      }
    }
  });
  return formattedProducts.filter(Boolean);
};

export const formatNebimOrders = async (orders = [], batchSize = 500) => {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  return await processInBatches(orders, batchSize, (order) => ({
    ModelType: 4,
    ItemTypeCode: 1,
    OrderNo: order.orderId,
    OrderDate: order.orderDate,
    Customer: {
      Name: `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim(),
      Email: order.orderCustomer?.email || '',
      Phone: order.orderCustomer?.phone || '',
      VatNo: order.orderPaymentDetails?.vatNo || '',
    },
    BillingAddress: {
      ...order.orderBillingAddress,
    },
    ShippingAddress: {
      ...order.orderShippingAddress,
    },
    Payment: {
      Method: order.orderPaymentDetails?.paymentMethod || '',
      Currency: order.orderPaymentDetails?.currencyCode || '',
      TotalAmount: order.totalInclVat || 0,
    },
    Items: (order.orderSkuList?.skuList || []).map((item) => ({
      SKU: item.merchantProductNo || item.channelProductNo || '',
      Quantity: item.quantity || 0,
      UnitPrice: item.unitPriceInclVat || 0,
      TotalPrice: item.lineTotalInclVat || 0,
      VatRate: item.vatRate || 0,
      Description: item.description || '',
    })),
    Comments: order.merchantComment || '',
    Status: order.status || '',
    IsBusinessOrder: order.isBusinessOrder || false,
  }));
};
