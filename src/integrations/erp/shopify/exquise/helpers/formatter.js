import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { MAX_PRICE } from '../constants/common.js';
import { extractImages, getColorImages } from './common.js';

// Exquise variant SKUs follow the pattern <base>_<colorCode>_<size>
// e.g. "E24Y04218085_591_34" → base "E24Y04218085", color "591", size "34"
const parseExquiseSku = (sku) => {
  if (!sku || typeof sku !== 'string') return null;
  const trimmedSku = sku.trim();
  if (!trimmedSku) return null;
  const parts = trimmedSku.split('_').map((p) => p.trim());
  if (parts.length < 3) return null;
  const size = parts[parts.length - 1];
  const colorCode = parts[parts.length - 2];
  const base = parts.slice(0, -2).join('_');
  if (!base || !colorCode || !size) return null;
  return { base, colorCode, size, parentSku: `${base}_${colorCode}`, childSku: trimmedSku };
};

export const formatProducts = async (rawProducts = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const formattedProducts = [];

  await processInBatches(rawProducts, batchSize, async (batch) => {
    for (const product of batch) {
      const { id, title, description, variants: rawVariants = [], category, status, sarPrices } = product;

      if (!rawVariants.length) continue;

      // Only keep variants that are actually sellable: in stock, with a real
      // color and a real size. Anything else is skipped entirely rather than
      // stored with a placeholder/blank attribute.
      const variants = rawVariants.filter(
        (v) => (Number(v.stock) || 0) > 0 && (v.color || '').trim() && (v.size || '').trim()
      );

      if (!variants.length) continue;

      /* ---------------- GRAND PARENT (values only; pushed once a storable color group exists) ---------------- */
      // Derive grandparent SKU from the first variant whose SKU matches the Exquise pattern.
      // Falls back to the Shopify product id when no variant has a parseable SKU.
      const firstParsed = variants.map((v) => parseExquiseSku(v.sku)).find(Boolean);
      const grandParentSku = firstParsed?.base || String(id);
      const grandParentStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      const categoryTrail = category?.fullName || '';

      // Use sarPrices as the base price when available, otherwise fall back to variant price
      const basePrice = sarPrices ?? (Number(variants[0]?.price) || 0);
      const isPriceInactive = Number(basePrice) >= MAX_PRICE;
      const grandParentStatus = isPriceInactive ? 'inactive' : status;

      const buildGrandParentProduct = () =>
        canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: null,
            parentProductSkuCode: null,
            productSkuCode: grandParentSku,
            name: title || '',
            nameAr: '',
            description: htmlToPlainText(description) || '',
            descriptionAr: '',
            brand: 'exquise',
            color: '',
            size: '',
            ean: '',
            categoryTrail,
            price: basePrice,
            minPrice: null,
            maxPrice: null,
            msrp: basePrice,
            purchasePrice: basePrice,
            shippingCost: 0,
            shippingTime: 0,
            currentStockCount: grandParentStock,
            volumetricWeightCm: 0,
            hsCodeAE: '1111111',
            hsCodeSA: '1111111',
            vatRateType: 'STANDARD',
            productType: 'configurable',
            ...extractImages(product),
            source: 'SHOPIFY',
            status: grandParentStatus,
            noonPrice: basePrice,
            namshiPrice: basePrice,
          },
          sellerId
        );

      let grandParentPushed = false;

      /* ---------------- GROUP VARIANTS BY COLOR ---------------- */
      const groupedByColor = {};
      for (const variant of variants) {
        const color = variant.color;
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
        // Prefer the parent SKU derived from variant.sku (e.g. "<base>_<colorCode>");
        // fall back to "<grandParentSku>-<COLOR>" when no variant in the group is parseable.
        const safeColor = color.replace(/\s+/g, '_').toUpperCase();
        const parsedInGroup = colorVariants.map((v) => parseExquiseSku(v.sku)).find(Boolean);
        const parentSku = parsedInGroup?.parentSku || `${grandParentSku}-${safeColor}`;

        const parentPrices = colorVariants.map((v) => Number(v.price) || 0);

        // Get color-specific images: primary + unassigned neighbors in both directions
        const colorImages = getColorImages(product.images, colorVariants, allVariantImageIds);
        const parentImages = extractImages(product, null, colorImages);

        // No resolvable image for this color -> don't store this color group at all
        // (children share the same colorImages, so this covers them too).
        if (!parentImages.primaryImageUrl) continue;

        const parentStock = colorVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        if (!grandParentPushed) {
          formattedProducts.push(buildGrandParentProduct());
          grandParentPushed = true;
        }

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
            brand: 'exquise',
            color,
            size: '',
            ean: '',
            categoryTrail,
            price: sarPrices ?? (parentPrices[0] || 0),
            minPrice: null,
            maxPrice: null,
            msrp: sarPrices ?? (parentPrices[0] || 0),
            purchasePrice: sarPrices ?? (parentPrices[0] || 0),
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
            status: isPriceInactive ? 'inactive' : status,
            noonPrice: sarPrices ?? (parentPrices[0] || 0),
            namshiPrice: sarPrices ?? (parentPrices[0] || 0),
          },
          sellerId
        );

        formattedProducts.push(parentProduct);

        /* ---------------- CHILD (VARIANT) ---------------- */
        for (const variant of colorVariants) {
          const size = variant.size || '';
          // Use variant.sku directly when it parses (e.g. "E24Y04218085_591_34");
          // fall back to "<parentSku>-<SIZE>" or "<parentSku>-<variant.id>" otherwise.
          const parsedVariant = parseExquiseSku(variant.sku);
          const childSku =
            parsedVariant?.childSku ||
            (size ? `${parentSku}-${size.replace(/\s+/g, '_').toUpperCase()}` : `${parentSku}-${variant.id}`);

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
              brand: 'exquise',
              color,
              size,
              ean: variant.barcode || '',
              categoryTrail,
              price: sarPrices ?? (Number(variant.price) || 0),
              minPrice: null,
              maxPrice: null,
              msrp: sarPrices ?? (Number(variant.price) || 0),
              purchasePrice: sarPrices ?? (Number(variant.price) || 0),
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
              status: isPriceInactive ? 'inactive' : status,
              noonPrice: sarPrices ?? (Number(variant.price) || 0),
              namshiPrice: sarPrices ?? (Number(variant.price) || 0),
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
          processed_at: orderDate,
          customer: {
            first_name: orderCustomer?.firstName || 'N/A',
            last_name: orderCustomer?.lastName || 'N/A',
            email:
              orderCustomer?.email && orderCustomer.email !== 'no-email@channelengine.com'
                ? orderCustomer.email
                : 'N/A',
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
        note: `Updated from ${orderDoc.channelName} | MerchantOrderNo: ${orderDoc.merchantOrderNo}`,
        tags: `${orderDoc.channelName}, ChannelOrder:${orderDoc.orderId}`,
      },
    }));
};
