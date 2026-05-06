import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { MAX_PRICE } from '../constants/common.js';
import { extractImages, getColorImages } from './common.js';

// Exquise variant SKUs follow the pattern <base>_<colorCode>_<size>
// e.g. "E24Y04218085_591_34" → base "E24Y04218085", color "591", size "34"
const parseExquiseSku = (sku) => {
  if (!sku || typeof sku !== 'string') return null;
  const parts = sku.split('_');
  if (parts.length < 3) return null;
  const size = parts[parts.length - 1];
  const colorCode = parts[parts.length - 2];
  const base = parts.slice(0, -2).join('_');
  if (!base || !colorCode || !size) return null;
  return { base, colorCode, size, parentSku: `${base}_${colorCode}`, childSku: sku };
};

export const formatProducts = async (rawProducts = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const formattedProducts = [];

  await processInBatches(rawProducts, batchSize, async (batch) => {
    for (const product of batch) {
      const { id, title, description, variants = [], category, status, sarPrices } = product;

      if (!variants.length) continue;

      /* ---------------- GRAND PARENT ---------------- */
      // Derive grandparent SKU from the first variant whose SKU matches the Exquise pattern.
      // Falls back to the Shopify product id when no variant has a parseable SKU.
      const firstParsed = variants.map((v) => parseExquiseSku(v.sku)).find(Boolean);
      const grandParentSku = firstParsed?.base || String(id);
      const productImages = extractImages(product); // all product images
      const grandParentStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      const categoryTrail = category?.fullName || '';

      // Use sarPrices as the base price when available, otherwise fall back to variant price
      const basePrice = sarPrices ?? (Number(variants[0]?.price) || 0);
      const isPriceInactive = Number(basePrice) >= MAX_PRICE;
      const grandParentStatus = isPriceInactive ? 'inactive' : status;

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
          primaryImageUrl: productImages.primaryImageUrl,
          imageUrl: productImages.imageUrl,
          images: productImages.images,
          extraImageUrl1: productImages.extraImageUrl1,
          extraImageUrl2: productImages.extraImageUrl2,
          extraImageUrl3: productImages.extraImageUrl3,
          source: 'SHOPIFY',
          status: grandParentStatus,
          noonPrice: basePrice,
          namshiPrice: basePrice,
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
        // Prefer the parent SKU derived from variant.sku (e.g. "<base>_<colorCode>");
        // fall back to "<grandParentSku>-<COLOR>" when no variant in the group is parseable.
        const safeColor = color.replace(/\s+/g, '_').toUpperCase();
        const parsedInGroup = colorVariants.map((v) => parseExquiseSku(v.sku)).find(Boolean);
        const parentSku = parsedInGroup?.parentSku || `${grandParentSku}-${safeColor}`;

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
            primaryImageUrl: parentImages.primaryImageUrl,
            imageUrl: parentImages.imageUrl,
            images: parentImages.images,
            extraImageUrl1: parentImages.extraImageUrl1,
            extraImageUrl2: parentImages.extraImageUrl2,
            extraImageUrl3: parentImages.extraImageUrl3,
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
              primaryImageUrl: variantImages.primaryImageUrl,
              imageUrl: variantImages.imageUrl,
              images: variantImages.images,
              extraImageUrl1: variantImages.extraImageUrl1,
              extraImageUrl2: variantImages.extraImageUrl2,
              extraImageUrl3: variantImages.extraImageUrl3,
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
