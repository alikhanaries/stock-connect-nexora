import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { extractImages, getColorImages } from './common.js';

export const formatProducts = async (rawProducts = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const formattedProducts = [];

  await processInBatches(rawProducts, batchSize, async (batch) => {
    for (const product of batch) {
      const {
        id,
        title,
        description,
        variants = [],
        category,
        status,
        sarPriceNamshi,
        sarPriceNoon,
        sarPriceAmazon,
        sarPriceStyli,
        sarPrice6thstreet,
      } = product;

      if (!variants.length) continue;

      /* ---------------- GRAND PARENT ---------------- */
      const grandParentSku = id;
      const productImages = extractImages(product); // all product images
      const grandParentStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      const categoryTrail = category?.fullName || '';

      const grandParentProduct = canonicalProductMapper(
        {
          sellerId,
          grandParentProductSkuCode: null,
          parentProductSkuCode: null,
          productSkuCode: grandParentSku,
          name: title || '',
          nameAr: '',
          description: htmlToPlainText(description) || '',
          descriptionAr: '',
          brand: 'catch',
          color: '',
          size: '',
          ean: '',
          categoryTrail,
          price: Number(variants[0]?.price) || 0,
          minPrice: null,
          maxPrice: null,
          msrp: Number(variants[0]?.price) || 0,
          purchasePrice: Number(variants[0]?.price) || 0,
          shippingCost: 0,
          shippingTime: 0,
          currentStockCount: grandParentStock,
          volumetricWeightCm: 0,
          hsCodeAE: '1111111',
          hsCodeSA: '1111111',
          vatRateType: 'STANDARD',
          productType: 'configurable',
          ...productImages,
          source: 'SHOPIFY',
          status,
          noonPrice: sarPriceNoon,
          namshiPrice: sarPriceNamshi,
          amazonPrice: sarPriceAmazon,
          styliPrice: sarPriceStyli,
          sixthStreetPrice: sarPrice6thstreet,
        },
        sellerId
      );

      formattedProducts.push(grandParentProduct);

      /* ---------------- GROUP VARIANTS BY COLOR ---------------- */
      const groupedByColor = {};
      for (const variant of variants) {
        const color = variant.color || '';
        if (!groupedByColor[color]) groupedByColor[color] = [];
        groupedByColor[color].push(variant);
      }

      /* Build set of all variant primary image IDs for color-based image slicing */
      const allVariantImageIds = new Set();
      for (const variant of variants) {
        if (variant.image?.id) allVariantImageIds.add(variant.image.id);
      }

      /* ---------------- PARENT (COLOR) ---------------- */
      for (const [color, colorVariants] of Object.entries(groupedByColor)) {
        const safeColor = color.replace(/\s+/g, '_').toUpperCase();
        const parentSku = `${grandParentSku}-${safeColor}`;

        const parentPrices = colorVariants.map((v) => Number(v.price) || 0);

        // Get color-specific images: primary + unassigned neighbors in both directions
        const colorImages = getColorImages(product.images, colorVariants, allVariantImageIds);
        const parentImages = extractImages(product, null, colorImages);
        const parentStock = colorVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        const parentProduct = canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: grandParentSku,
            parentProductSkuCode: null,
            productSkuCode: parentSku,
            name: title || '',
            nameAr: '',
            description: htmlToPlainText(description) || '',
            descriptionAr: '',
            brand: 'catch',
            color,
            size: '',
            ean: '',
            categoryTrail,
            price: parentPrices[0] || 0,
            minPrice: null,
            maxPrice: null,
            msrp: parentPrices[0] || 0,
            purchasePrice: parentPrices[0] || 0,
            shippingCost: 0,
            shippingTime: 0,
            currentStockCount: parentStock,
            volumetricWeightCm: 0,
            hsCodeAE: '1111111',
            hsCodeSA: '1111111',
            vatRateType: 'STANDARD',
            productType: 'configurable',
            ...parentImages,
            source: 'SHOPIFY',
            status,
            noonPrice: sarPriceNoon,
            namshiPrice: sarPriceNamshi,
            amazonPrice: sarPriceAmazon,
            styliPrice: sarPriceStyli,
            sixthStreetPrice: sarPrice6thstreet,
          },
          sellerId
        );

        formattedProducts.push(parentProduct);

        /* ---------------- CHILD (VARIANT) ---------------- */
        for (const variant of colorVariants) {
          const size = variant.size || '';
          const childSku = size
            ? `${parentSku}-${size.replace(/\s+/g, '_').toUpperCase()}`
            : `${parentSku}-${variant.id}`;

          // Child uses same color-specific images as parent
          const variantImages = extractImages(product, null, colorImages);

          const childProduct = canonicalProductMapper(
            {
              sellerId,
              grandParentProductSkuCode: null,
              parentProductSkuCode: parentSku,
              productSkuCode: childSku,
              name: title || '',
              nameAr: '',
              description: htmlToPlainText(description) || '',
              descriptionAr: '',
              brand: 'catch',
              color,
              size,
              ean: variant.barcode || '',
              categoryTrail,
              price: Number(variant.price) || 0,
              minPrice: null,
              maxPrice: null,
              msrp: Number(variant.price) || 0,
              purchasePrice: Number(variant.price) || 0,
              shippingCost: 0,
              shippingTime: 0,
              currentStockCount: Number(variant.stock) || 0,
              volumetricWeightCm: 0,
              hsCodeAE: '1111111',
              hsCodeSA: '1111111',
              vatRateType: 'STANDARD',
              productType: 'simple',
              ...variantImages,
              source: 'SHOPIFY',
              status,
              noonPrice: sarPriceNoon,
              namshiPrice: sarPriceNamshi,
              amazonPrice: sarPriceAmazon,
              styliPrice: sarPriceStyli,
              sixthStreetPrice: sarPrice6thstreet,
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

export const formatOrdersToShopifyPayloads = (orders = [], skuToVariantId = new Map()) => {
  if (!Array.isArray(orders)) {
    throw new Error('Expected orders to be an array');
  }

  return orders
    .filter(Boolean)
    .map((orderDoc) => {
      const {
        orderSkuList,
        orderCustomer,
        orderBillingAddress,
        orderShippingAddress,
        orderPaymentDetails,
        orderDate,
        channelName,
        merchantOrderNo,
        orderId,
      } = orderDoc;

      const lineItems = (orderSkuList?.skuList || []).map((sku) => ({
        quantity: sku.quantity || 1,
        variant_id: skuToVariantId.get(sku?.merchantProductNo) || sku?.merchantProductNo,
      }));

      if (!lineItems.length) return null;

      return {
        order: {
          _id: orderDoc?._id,
          line_items: lineItems,
          currency: (orderPaymentDetails?.currencyCode || 'USD').toUpperCase(),
          financial_status: 'paid',
          processed_at: orderDate || 'N/A',
          customer: {
            first_name: orderCustomer?.firstName || 'N/A',
            last_name: orderCustomer?.lastName || 'N/A',
            email:
              orderCustomer?.email && orderCustomer.email !== 'no-email@channelengine.com'
                ? orderCustomer.email
                : undefined,
          },

          billing_address: {
            first_name: orderBillingAddress?.firstName || 'N/A',
            last_name: orderBillingAddress?.lastName || 'N/A',
            address1: orderBillingAddress?.line1 || 'N/A',
            city: orderBillingAddress?.city || 'N/A',
            zip: orderBillingAddress?.zipCode || 'N/A',
            country: orderBillingAddress?.countryIso || 'N/A',
            company: orderBillingAddress?.companyName || 'N/A',
          },

          shipping_address: {
            first_name: orderShippingAddress?.firstName || 'N/A',
            last_name: orderShippingAddress?.lastName || 'N/A',
            address1: orderShippingAddress?.line1 || 'N/A',
            city: orderShippingAddress?.city || 'N/A',
            zip: orderShippingAddress?.zipCode || 'N/A',
            country: orderShippingAddress?.countryIso || 'N/A',
            company: orderShippingAddress?.companyName || 'N/A',
          },

          note: `Imported from ${channelName || 'N/A'} | MerchantOrderNo: ${merchantOrderNo || 'N/A'}`,

          tags: [channelName || 'N/A', `ChannelOrder:${orderId || 'N/A'}`].join(', '),
        },
      };
    })
    .filter(Boolean);
};

export const formatOrdersToShopifyUpdatePayloads = (orders = []) => {
  if (!Array.isArray(orders)) {
    throw new Error('Expected orders to be an array');
  }

  return orders
    .filter(Boolean)
    .filter((orderDoc) => orderDoc.shopifySync?.shopifyOrderId)
    .map((orderDoc) => ({
      _id: orderDoc._id,
      shopifyOrderId: orderDoc.shopifySync.shopifyOrderId,
      order: {
        id: orderDoc.shopifySync.shopifyOrderId,
        note: `Updated from ${orderDoc.channelName || 'N/A'} | MerchantOrderNo: ${orderDoc.merchantOrderNo || 'N/A'}`,
        tags: `${orderDoc.channelName || 'N/A'}, ChannelOrder:${orderDoc.orderId || 'N/A'}`,
      },
    }));
};
