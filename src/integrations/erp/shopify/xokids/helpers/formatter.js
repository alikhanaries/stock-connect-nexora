import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';

const parseXokidsSku = (sku, safeColor) => {
  if (!sku || typeof sku !== 'string') return null;
  const trimmedSku = sku.trim();
  if (!trimmedSku) return null;

  if (trimmedSku.includes('_')) {
    const underscoreParts = trimmedSku.split('_');
    if (underscoreParts.length >= 2) {
      const base = underscoreParts[0].trim();

      // Split base by dash to separate base model from color code
      const baseParts = base.split('-');
      if (baseParts.length >= 2) {
        const model = baseParts[0].trim();
        const colorCode = baseParts[1].trim();
        return {
          grandParentSku: model,
          parentSku: `${model}-${colorCode}`,
          childSku: trimmedSku,
        };
      }

      // Fallback if base has no dash
      const suffix = underscoreParts[1].trim();
      let colorCode = safeColor;
      if (suffix.toUpperCase().startsWith('R') && suffix.length >= 4) {
        colorCode = suffix.substring(0, 4);
      }

      return {
        grandParentSku: base,
        parentSku: `${base}_${colorCode}`,
        childSku: trimmedSku,
      };
    }
  }

  const dashParts = trimmedSku.split('-');
  if (dashParts.length >= 3) {
    const base = dashParts[0].trim();
    const colorCode = dashParts[1].trim();
    return {
      grandParentSku: base,
      parentSku: `${base}-${colorCode}`,
      childSku: trimmedSku,
    };
  }

  // Fallback
  return null;
};

export const getColorImages = (productImages, colorVariants, allVariantImageIds) => {
  if (!productImages?.length || !colorVariants?.length) return [];

  // Build a set of image IDs that belong to this color's variants
  const currentColorImageIds = new Set();
  for (const variant of colorVariants) {
    if (variant.image?.id) currentColorImageIds.add(variant.image.id);
  }

  const colorPrimaryImageId = colorVariants[0]?.image?.id;
  if (!colorPrimaryImageId) return [];

  const primaryIdx = productImages.findIndex((img) => img.id === colorPrimaryImageId);
  if (primaryIdx === -1) return [];

  // Check if this is the first variant-assigned image in the array
  const isFirstVariantImage = !productImages.slice(0, primaryIdx).some((img) => allVariantImageIds.has(img.id));

  // If first variant image, also collect unassigned images before it (they belong to this color)
  const beforeImages = [];
  if (isFirstVariantImage) {
    for (let i = 0; i < primaryIdx; i++) {
      beforeImages.push(productImages[i]);
    }
  }

  // Collect images forward (after the primary) that are not assigned to another color
  // Skip images belonging to THIS color's variants, only break on OTHER color's images
  const afterImages = [];
  for (let i = primaryIdx + 1; i < productImages.length; i++) {
    const imgId = productImages[i].id;
    if (allVariantImageIds.has(imgId) && !currentColorImageIds.has(imgId)) break;
    afterImages.push(productImages[i]);
  }

  return [productImages[primaryIdx], ...beforeImages, ...afterImages];
};

export const filterImagesByColor = (productImages, colorName) => {
  if (!productImages?.length || !colorName) return [];

  const lowerColor = colorName.toLowerCase().trim();

  // Try matching color in URL or AltText
  const matched = productImages.filter((img) => {
    const urlLower = (img.url || '').toLowerCase();
    const altLower = (img.altText || '').toLowerCase();
    return urlLower.includes(lowerColor) || altLower.includes(lowerColor);
  });

  if (matched.length > 0) return matched;

  // Fallback to first image of the product if no color matches
  return productImages[0] ? [productImages[0]] : [];
};

export const extractImages = (product) => {
  const imagesArray = (product?.images || []).map((img) => img.url || '').filter(Boolean);
  const primary = imagesArray[0] || '';

  return {
    primaryImageUrl: primary,
    imageUrl: primary,
    images: imagesArray,
    extraImageUrl1: imagesArray[1] || '',
    extraImageUrl2: imagesArray[2] || '',
    extraImageUrl3: imagesArray[3] || '',
  };
};

export const formatXokidsShopifyProducts = async (
  rawProducts = [],
  sellerId,
  sellerSlug,
  approvedBrandName,
  batchSize = 500
) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const formattedProducts = [];

  await processInBatches(rawProducts, batchSize, async (batch) => {
    for (const product of batch) {
      const brandName = approvedBrandName;
      const { id, title, description, variants = [], category, status } = product;

      if (!variants.length) continue;

      let grandParentSku = String(id);
      const firstSku = variants.find((v) => v.sku)?.sku;
      if (firstSku) {
        const parsed = parseXokidsSku(firstSku, 'DEFAULT');
        if (parsed?.grandParentSku) {
          grandParentSku = parsed.grandParentSku;
        }
      }
      const productImages = extractImages(product);
      const categoryTrail = category?.fullName || '';

      /* Build set of all variant primary image IDs for color-based image slicing */
      const allVariantImageIds = new Set(product.allVariantImageIds || []);
      for (const variant of variants) {
        if (variant.image?.id) allVariantImageIds.add(variant.image.id);
      }

      /* ---------------- GROUP VARIANTS BY COLOR ---------------- */
      const groupedByColor = {};
      for (const variant of variants) {
        const color = variant.color || 'DEFAULT';
        if (!groupedByColor[color]) groupedByColor[color] = [];
        groupedByColor[color].push(variant);
      }

      // Determine the first color's isolated images to use for the Grandparent product
      const firstColor = Object.keys(groupedByColor)[0];
      const firstColorVariants = groupedByColor[firstColor] || [];
      let grandParentImages = productImages;
      if (firstColor) {
        let firstColorImages = getColorImages(product.images, firstColorVariants, allVariantImageIds);
        if (firstColorImages.length === 0) {
          firstColorImages = filterImagesByColor(product.images, firstColor);
        }
        if (firstColorImages.length > 0) {
          grandParentImages = extractImages({ images: firstColorImages });
        }
      }

      const grandParentStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      const basePrice = Number(variants[0]?.price) || 0;
      const noon = basePrice;
      const namshi = basePrice;
      const amazon = basePrice;
      const styli = basePrice;
      const sixthStreet = basePrice;

      const grandParentProduct = canonicalProductMapper(
        {
          sellerId,
          grandParentProductSkuCode: null,
          parentProductSkuCode: null,
          productSkuCode: grandParentSku,
          name: title || '',
          nameAr: title || '',
          description: htmlToPlainText(description) || '',
          descriptionAr: '',
          brand: brandName,
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
          primaryImageUrl: grandParentImages.primaryImageUrl || '',
          imageUrl: grandParentImages.imageUrl || '',
          images: grandParentImages.images || [],
          extraImageUrl1: grandParentImages.extraImageUrl1 || '',
          extraImageUrl2: grandParentImages.extraImageUrl2 || '',
          extraImageUrl3: grandParentImages.extraImageUrl3 || '',
          source: 'SHOPIFY',
          status,
          noonPrice: noon,
          namshiPrice: namshi,
          amazonPrice: amazon,
          styliPrice: styli,
          sixthStreetPrice: sixthStreet,
        },
        sellerId
      );

      formattedProducts.push(grandParentProduct);

      /* ---------------- PARENT (COLOR) ---------------- */
      for (const [color, colorVariants] of Object.entries(groupedByColor)) {
        const safeColor = color.replace(/\s+/g, '_').toUpperCase();
        let parentSku = `${grandParentSku}_${safeColor}`;
        const firstVariantSku = colorVariants.find((v) => v.sku)?.sku;
        if (firstVariantSku) {
          const parsed = parseXokidsSku(firstVariantSku, safeColor);
          if (parsed?.parentSku) {
            parentSku = parsed.parentSku;
          }
        }

        const parentPrices = colorVariants.map((v) => Number(v.price) || 0);
        const parentPrice = parentPrices[0] || 0;
        const pNoon = parentPrice;
        const pNamshi = parentPrice;
        const pAmazon = parentPrice;
        const pStyli = parentPrice;
        const pSixthStreet = parentPrice;

        // Get color-specific images
        let colorImages = getColorImages(product.images, colorVariants, allVariantImageIds);
        if (colorImages.length === 0) {
          colorImages = filterImagesByColor(product.images, color);
        }
        const parentImages = extractImages({ images: colorImages });

        const variantImage = colorVariants.find((v) => v?.image?.url)?.image?.url || parentImages.primaryImageUrl || '';
        const parentStock = colorVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        const parentProduct = canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: grandParentSku,
            parentProductSkuCode: null,
            productSkuCode: parentSku,
            name: title || '',
            nameAr: title || '',
            description: htmlToPlainText(description) || '',
            descriptionAr: '',
            brand: brandName,
            color,
            size: '',
            ean: '',
            categoryTrail,
            price: parentPrice,
            minPrice: null,
            maxPrice: null,
            msrp: parentPrice,
            purchasePrice: parentPrice,
            shippingCost: 0,
            shippingTime: 0,
            currentStockCount: parentStock,
            volumetricWeightCm: 0,
            hsCodeAE: '1111111',
            hsCodeSA: '1111111',
            vatRateType: 'STANDARD',
            productType: 'configurable',
            primaryImageUrl: variantImage || parentImages.primaryImageUrl || '',
            imageUrl: variantImage || parentImages.imageUrl || '',
            images: parentImages.images || [],
            extraImageUrl1: parentImages.extraImageUrl1 || '',
            extraImageUrl2: parentImages.extraImageUrl2 || '',
            extraImageUrl3: parentImages.extraImageUrl3 || '',
            source: 'SHOPIFY',
            status,
            noonPrice: pNoon,
            namshiPrice: pNamshi,
            amazonPrice: pAmazon,
            styliPrice: pStyli,
            sixthStreetPrice: pSixthStreet,
          },
          sellerId
        );

        formattedProducts.push(parentProduct);

        /* ---------------- CHILD (VARIANT) ---------------- */
        for (const variant of colorVariants) {
          const size = variant.size || '';
          const safeSize = size.replace(/\s+/g, '_').toUpperCase();
          let childSku = size ? `${parentSku}_${safeSize}` : `${parentSku}_${variant.id}`;
          if (variant.sku) {
            const parsed = parseXokidsSku(variant.sku, safeColor);
            if (parsed?.childSku) {
              childSku = parsed.childSku;
            }
          }

          const childPrice = Number(variant.price) || 0;
          const cNoon = childPrice;
          const cNamshi = childPrice;
          const cAmazon = childPrice;
          const cStyli = childPrice;
          const cSixthStreet = childPrice;

          const childImages = parentImages;

          const childProduct = canonicalProductMapper(
            {
              sellerId,
              grandParentProductSkuCode: null,
              parentProductSkuCode: parentSku,
              productSkuCode: childSku,
              name: title || '',
              nameAr: title || '',
              description: htmlToPlainText(description) || '',
              descriptionAr: '',
              brand: brandName,
              color,
              size,
              ean: variant.barcode || '',
              categoryTrail,
              price: childPrice,
              minPrice: null,
              maxPrice: null,
              msrp: childPrice,
              purchasePrice: childPrice,
              shippingCost: 0,
              shippingTime: 0,
              currentStockCount: Number(variant.stock) || 0,
              volumetricWeightCm: 0,
              hsCodeAE: '1111111',
              hsCodeSA: '1111111',
              vatRateType: 'STANDARD',
              productType: 'simple',
              primaryImageUrl: variant.image?.url || variantImage || childImages.primaryImageUrl || '',
              imageUrl: variant.image?.url || variantImage || childImages.imageUrl || '',
              images: childImages.images || [],
              extraImageUrl1: childImages.extraImageUrl1 || '',
              extraImageUrl2: childImages.extraImageUrl2 || '',
              extraImageUrl3: childImages.extraImageUrl3 || '',
              source: 'SHOPIFY',
              status,
              noonPrice: cNoon,
              namshiPrice: cNamshi,
              amazonPrice: cAmazon,
              styliPrice: cStyli,
              sixthStreetPrice: cSixthStreet,
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
