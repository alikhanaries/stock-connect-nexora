import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { htmlToPlainText } from '#root/src/integrations/common/helpers/htmlParserToString.js';
import { extractImages } from '#root/src/integrations/erp/shopify/helpers/common.js';

export const formatProducts = async (rawProducts = [], sellerId, batchSize = 500) => {
  if (!Array.isArray(rawProducts) || rawProducts.length === 0) return [];

  const formattedProducts = [];

  await processInBatches(rawProducts, batchSize, async (batch) => {
    for (const product of batch) {
      const { id, title, description, vendor, variants = [], category } = product;

      if (!variants.length) continue;

      /* ---------------- GRAND PARENT ---------------- */
      const grandParentSku = String(id);
      const productImages = extractImages(product);

      // Grandparent stock: sum of all variant stocks
      const grandParentStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const categoryTrail = category?.fullName || '';

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
          brand: vendor || '',
          color: '',
          size: '',
          ean: '',
          categoryTrail,
          price: Number(variants[0]?.price) || 0,
          minPrice: Math.min(...variants.map((v) => Number(v.price) || 0)),
          maxPrice: Math.max(...variants.map((v) => Number(v.price) || 0)),
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
          primaryImageUrl: productImages.primaryImageUrl || '',
          imageUrl: productImages.imageUrl || '',
          images: productImages.images || [],
          extraImageUrl1: productImages.extraImageUrl1 || '',
          extraImageUrl2: productImages.extraImageUrl2 || '',
          extraImageUrl3: productImages.extraImageUrl3 || '',
          source: 'SHOPIFY',
        },
        sellerId
      );

      formattedProducts.push(grandParentProduct);

      /* ---------------- GROUP VARIANTS BY COLOR ---------------- */
      const groupedByColor = {};
      for (const variant of variants) {
        const color = variant.color || 'DEFAULT';
        if (!groupedByColor[color]) groupedByColor[color] = [];
        groupedByColor[color].push(variant);
      }

      /* ---------------- PARENT (COLOR) ---------------- */
      for (const [color, colorVariants] of Object.entries(groupedByColor)) {
        const safeColor = color.replace(/\s+/g, '_').toUpperCase();
        const parentSku = `${grandParentSku}-${safeColor}`;

        const parentPrices = colorVariants.map((v) => Number(v.price) || 0);

        // Parent stock: sum of variant stocks
        const parentStock = colorVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        const parentProduct = await canonicalProductMapper(
          {
            sellerId,
            grandParentProductSkuCode: grandParentSku,
            parentProductSkuCode: null,
            productSkuCode: parentSku,
            name: title || '',
            nameAr: title || '',
            description: htmlToPlainText(description) || '',
            descriptionAr: '',
            brand: vendor || '',
            color,
            size: '',
            ean: '',
            categoryTrail,
            price: parentPrices[0] || 0,
            minPrice: Math.min(...parentPrices),
            maxPrice: Math.max(...parentPrices),
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
            primaryImageUrl: productImages.primaryImageUrl || '',
            imageUrl: productImages.imageUrl || '',
            images: productImages.images || [],
            extraImageUrl1: productImages.extraImageUrl1 || '',
            extraImageUrl2: productImages.extraImageUrl2 || '',
            extraImageUrl3: productImages.extraImageUrl3 || '',
            source: 'SHOPIFY',
          },
          sellerId
        );

        formattedProducts.push(parentProduct);

        /* ---------------- CHILD (VARIANT) ---------------- */
        for (const variant of colorVariants) {
          const size = variant.size || '';

          const childSku =
            variant.id ||
            variant.sku ||
            (size ? `${parentSku}-${size.replace(/\s+/g, '_').toUpperCase()}` : `${parentSku}-${variant.id}`);

          const variantImages = extractImages(product, variant);

          const childProduct = await canonicalProductMapper(
            {
              sellerId,
              grandParentProductSkuCode: null,
              parentProductSkuCode: parentSku,
              productSkuCode: childSku,
              name: title || '',
              nameAr: title || '',
              description: htmlToPlainText(description) || '',
              descriptionAr: '',
              brand: vendor || '',
              color,
              size,
              ean: variant.barcode || '',
              categoryTrail,
              price: Number(variant.price) || 0,
              minPrice: Number(variant.price) || 0,
              maxPrice: Number(variant.price) || 0,
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
              primaryImageUrl: variantImages.primaryImageUrl || '',
              imageUrl: variantImages.imageUrl || '',
              images: variantImages.images || [],
              extraImageUrl1: variantImages.extraImageUrl1 || '',
              extraImageUrl2: variantImages.extraImageUrl2 || '',
              extraImageUrl3: variantImages.extraImageUrl3 || '',
              source: 'SHOPIFY',
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
