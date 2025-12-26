import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { convertUsdToSar } from '#root/src/integrations/common/helpers/currencyConverter.js';
export const formatNebimProducts = async (raw = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // Helper to extract only Cat02
  const extractCategory = (cat02 = '') => cat02?.trim() || '';

  // Group by ItemCode safely
  const groupedByItemCode = raw.reduce((acc, item) => {
    const code = item?.ItemCode ? String(item.ItemCode).trim() : null;
    if (!code) return acc;
    if (!acc[code]) acc[code] = [];
    acc[code].push(item);
    return acc;
  }, {});

  let itemGroups = Object.entries(groupedByItemCode);
  const formattedProducts = [];

  await processInBatches(itemGroups, batchSize, async (batch) => {
    for (const [itemCode, items] of batch) {
      const safeItemCode = itemCode || '';

      // Only stock items WITH price > 0
      const stockItems = items.filter((it) => Number(it?.Qty || 0) > 0 && Number(it?.Price || 0) > 0);
      if (stockItems.length === 0) continue;

      // Must have Color & Size
      const validItems = stockItems.filter((it) => it?.ColorDesc?.trim() && it?.ItemDim1Desc?.trim());
      if (validItems.length === 0) continue;

      const first = validItems[0];
      const grandParentSku = safeItemCode;
      const grandParentPrice = await convertUsdToSar(Number(first.Price || 0));

      // --------------------------
      // GRANDPARENT PRODUCT
      // --------------------------
      const grandParentProduct = canonicalProductMapper(
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
          categoryTrail: extractCategory(first.Cat02Desc),
          price: grandParentPrice,
          minPrice: grandParentPrice,
          maxPrice: grandParentPrice,
          msrp: grandParentPrice,
          purchasePrice: grandParentPrice,
          currentStockCount: Number(first.Qty || 0),
          hsCodeAE: first.HsCode || '',
          hsCodeSA: first.HsCode || '',
          productType: 'configurable',
          volumetricWeightCm: 0.3,
          __sortItemCode: safeItemCode,
          __sortLevel: 1,
          __sortVariant: 0,
        },
        sellerId
      );
      formattedProducts.push(grandParentProduct);

      // --------------------------
      // GROUP BY COLOR SAFELY
      // --------------------------
      const groupedByColor = validItems.reduce((acc, item) => {
        const color = item?.ColorDesc ? item.ColorDesc.trim() : null;
        if (!color) return acc;
        if (!acc[color]) acc[color] = [];
        acc[color].push(item);
        return acc;
      }, {});

      for (const [colorDesc, colorItems] of Object.entries(groupedByColor)) {
        const safeColorDesc = colorDesc || '';

        // Only stock & price > 0
        const stockColorItems = colorItems.filter((v) => Number(v?.Qty || 0) > 0 && Number(v?.Price || 0) > 0);
        if (stockColorItems.length === 0) continue;

        const firstColor = stockColorItems[0];
        const parentSku = `${safeItemCode}_${firstColor.ColorCode || '0'}`;
        const parentPrice = await convertUsdToSar(Number(firstColor.Price || 0));

        // --------------------------
        // PARENT PRODUCT
        // --------------------------
        const parentProduct = canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: grandParentSku,
            parentProductSkuCode: null,
            productSkuCode: parentSku,
            name: firstColor.ItemName || '',
            nameAr: firstColor.ItemName || '',
            description: firstColor.ItemDesc || '',
            descriptionAr: firstColor.ItemDesc || '',
            brand: firstColor.BrandDesc || '',
            color: safeColorDesc,
            size: '',
            ean: '',
            categoryTrail: extractCategory(firstColor.Cat02Desc),
            price: parentPrice,
            minPrice: parentPrice,
            maxPrice: parentPrice,
            msrp: parentPrice,
            purchasePrice: parentPrice,
            currentStockCount: Number(firstColor.Qty || 0),
            productType: 'configurable',
            volumetricWeightCm: 0.3,
            __sortItemCode: safeItemCode,
            __sortLevel: 2,
            __sortVariant: Number(firstColor.ColorCode || 0),
          },
          sellerId
        );
        formattedProducts.push(parentProduct);

        // --------------------------
        // CHILD PRODUCTS (SIZE VARIANTS)
        // --------------------------
        for (const variant of stockColorItems) {
          const sizeCode = variant?.ItemDim1Desc?.trim() || '';
          const childSku = `${safeItemCode}_${variant.ColorCode || '0'}_${variant.ItemDim1Code || '0'}`;
          const childPrice = await convertUsdToSar(Number(variant.Price || 0));

          const childProduct = canonicalProductMapper(
            {
              sellerId,
              grandParentProductSkuCode: null,
              parentProductSkuCode: parentSku,
              productSkuCode: childSku,
              name: variant.ItemName || '',
              nameAr: variant.ItemName || '',
              description: variant.ItemDesc || '',
              descriptionAr: variant.ItemDesc || '',
              brand: variant.BrandDesc || '',
              color: safeColorDesc,
              size: sizeCode,
              ean: variant.Barcode || '',
              categoryTrail: extractCategory(variant.Cat02Desc),
              price: childPrice,
              minPrice: childPrice,
              maxPrice: childPrice,
              msrp: childPrice,
              purchasePrice: childPrice,
              currentStockCount: Number(variant.Qty || 0),
              productType: 'simple',
              volumetricWeightCm: 0.3,
              __sortItemCode: safeItemCode,
              __sortLevel: 3,
              __sortVariant: Number(variant.ItemDim1Code || 0),
            },
            sellerId
          );

          formattedProducts.push(childProduct);
        }
      }
    }
  });

  // --------------------------
  // FINAL SERIAL SORTING
  // --------------------------
  const sorted = formattedProducts.filter(Boolean).sort((a, b) => {
    const itemA = a.__sortItemCode || '';
    const itemB = b.__sortItemCode || '';
    const lvlA = a.__sortLevel || 0;
    const lvlB = b.__sortLevel || 0;
    const varA = a.__sortVariant || 0;
    const varB = b.__sortVariant || 0;

    return itemA.localeCompare(itemB) || lvlA - lvlB || varA - varB;
  });

  // Remove temp fields
  return sorted.map((p) => {
    delete p.__sortItemCode;
    delete p.__sortLevel;
    delete p.__sortVariant;
    return p;
  });
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
