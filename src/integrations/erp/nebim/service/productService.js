import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createERPAdapter } from '#root/src/integrations/erp/base/ERPFactory.js';
import { formatNebimProducts } from '#root/src/integrations/erp/nebim/helpers/formatter.js';
import { handleNebimError } from '#root/src/integrations/erp/nebim/util/handleError.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;
const adapter = createERPAdapter('nebim');
export const fetchAndStoreNebimProducts = async (sellerId) => {
  try {
    const rawProducts = await adapter.fetchProducts();
    if (!rawProducts?.length) return;

    const canonicalProducts = await formatNebimProducts(rawProducts, sellerId, MAX_BATCH_SIZE);

    // SERIALWISE SORTING BEFORE INSERT (SAFE VERSION)

    canonicalProducts.sort((a, b) => {
      const codeA = a.ItemCode || '';
      const codeB = b.ItemCode || '';

      if (codeA !== codeB) return codeA.localeCompare(codeB);

      const levelA = a.__sortLevel || 0;
      const levelB = b.__sortLevel || 0;
      if (levelA !== levelB) return levelA - levelB;

      const variantA = a.__sortVariant || 0;
      const variantB = b.__sortVariant || 0;
      return variantA - variantB;
    });

    // Collect category trails
    const categoryTrails = new Set();
    for (const product of canonicalProducts) {
      if (product.categoryTrail) {
        categoryTrails.add(product.categoryTrail);
      }
    }

    // SEQUENTIAL INSERT / UPDATE

    for (const product of canonicalProducts) {
      //  Fields allowed to update for existing products
      const updateFields = {
        // Images
        extraImageUrl1: product.extraImageUrl1,
        extraImageUrl2: product.extraImageUrl2,
        extraImageUrl3: product.extraImageUrl3,
        imageUrl: product.imageUrl,
        primaryImageUrl: product.primaryImageUrl,

        // Stock
        currentStockCount: product.currentStockCount,

        // Text
        description: product.description,
        descriptionAr: product.descriptionAr,
        name: product.name,
        nameAr: product.nameAr,
      };

      //  Insert-only object (remove conflicting fields)
      const insertOnlyProduct = { ...product };

      delete insertOnlyProduct.extraImageUrl1;
      delete insertOnlyProduct.extraImageUrl2;
      delete insertOnlyProduct.extraImageUrl3;
      delete insertOnlyProduct.imageUrl;
      delete insertOnlyProduct.primaryImageUrl;
      delete insertOnlyProduct.currentStockCount;
      delete insertOnlyProduct.description;
      delete insertOnlyProduct.descriptionAr;
      delete insertOnlyProduct.name;
      delete insertOnlyProduct.nameAr;

      await Product.updateOne(
        {
          productSkuCode: product.productSkuCode,
          sellerId: product.sellerId,
        },
        {
          $set: updateFields,
          $setOnInsert: insertOnlyProduct,
        },
        { upsert: true }
      );
    }

    // Insert category trails if any
    if (categoryTrails.size > 0) {
      insertCategoryTrail([...categoryTrails], sellerId);
    }

    console.log('Products saved successfully.');
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
  }
};
