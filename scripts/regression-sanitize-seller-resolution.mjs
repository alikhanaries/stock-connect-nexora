/**
 * Regression: sanitizeOrdersData sellerId resolution (Product map + ExtraData fallback).
 *
 * Covers:
 *   1. Product mapping exists
 *   2. Product missing but ExtraData.sellerId exists
 *   3. Product missing and ExtraData missing → line dropped
 *   4. Multi-line order where only some SKUs are missing from Product
 *   5. SellerOrder payload / products built from recovered skuList
 *
 * Run: node scripts/regression-sanitize-seller-resolution.mjs
 *   or: yarn test:sanitize-seller-resolution
 */
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import Order from '../src/models/Orders.js';
import { getExtraSellerId, resolveOrderLineSellerId, sanitizeOrdersData } from '../src/helpers/Order.js';

const SELLER_A = new mongoose.Types.ObjectId('69b7cd31be12eee3228c3251');
const SELLER_B = new mongoose.Types.ObjectId('691ebf3543f00a6953642c85');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${message}`);
  } else {
    failed++;
    console.error(`  FAIL  ${message}`);
  }
}

function makeCeOrder({ id, lines }) {
  return {
    Id: id,
    ChannelOrderNo: `CE-TEST-${id}`,
    ChannelId: 1,
    ChannelName: 'Amazon.in (v3)',
    GlobalChannelId: 1,
    GlobalChannelName: 'Amazon',
    OrderDate: new Date().toISOString(),
    Status: 'IN_PROGRESS',
    MerchantOrderNo: `MO-${id}`,
    IsBusinessOrder: false,
    SubTotalInclVat: 100,
    TotalInclVat: 100,
    ShippingCostsInclVat: 0,
    Lines: lines,
    BillingAddress: { FirstName: 'T', LastName: 'U', Gender: 'NA' },
    ShippingAddress: { FirstName: 'T', LastName: 'U', CountryIso: 'SA' },
  };
}

function line({ id, mpn, qty = 1, extraSellerId = null }) {
  return {
    Id: id,
    MerchantProductNo: mpn,
    Quantity: qty,
    Status: 'IN_PROGRESS',
    UnitPriceInclVat: 10,
    ExtraData: extraSellerId ? [{ Key: 'sellerId', Value: String(extraSellerId) }] : [],
  };
}

async function withMocks({ products = [], existingOrders = [] }, fn) {
  const originalProductFind = Product.find;
  const originalOrderFind = Order.find;

  Product.find = () => ({
    select: () => ({
      lean: async () => products,
    }),
  });
  Order.find = () => ({
    lean: async () => existingOrders,
  });

  try {
    return await fn();
  } finally {
    Product.find = originalProductFind;
    Order.find = originalOrderFind;
  }
}

async function run() {
  console.log('\n=== resolveOrderLineSellerId / getExtraSellerId unit cases ===\n');

  // getExtraSellerId formats
  assert(
    String(getExtraSellerId([{ Key: 'sellerId', Value: String(SELLER_B) }])) === String(SELLER_B),
    'getExtraSellerId reads Key/Value ExtraData'
  );
  assert(
    String(getExtraSellerId([{ key: 'sellerId', value: String(SELLER_B) }])) === String(SELLER_B),
    'getExtraSellerId reads key/value ExtraData'
  );
  assert(getExtraSellerId([]) === null, 'getExtraSellerId empty → null');
  assert(getExtraSellerId([{ Key: 'sellerId', Value: 'not-an-oid' }]) === null, 'getExtraSellerId invalid oid → null');

  const map = new Map([['SKU-MAPPED', SELLER_A]]);

  const mapped = resolveOrderLineSellerId({
    merchantProductNo: 'SKU-MAPPED',
    productSellerMap: map,
    existingSku: null,
    extraData: [{ Key: 'sellerId', Value: String(SELLER_B) }],
    finalSellerId: null,
  });
  assert(
    String(mapped.sellerId) === String(SELLER_A) && mapped.source === 'productMap',
    'Product map wins over ExtraData'
  );

  const fromExtra = resolveOrderLineSellerId({
    merchantProductNo: 'SKU-UNMAPPED',
    productSellerMap: map,
    existingSku: null,
    extraData: [{ Key: 'sellerId', Value: String(SELLER_B) }],
    finalSellerId: null,
  });
  assert(
    String(fromExtra.sellerId) === String(SELLER_B) && fromExtra.source === 'extraData',
    'ExtraData used when Product map misses'
  );

  const none = resolveOrderLineSellerId({
    merchantProductNo: 'SKU-UNMAPPED',
    productSellerMap: map,
    existingSku: null,
    extraData: [],
    finalSellerId: null,
  });
  assert(none.sellerId === null && none.source === null, 'No source → null sellerId');

  console.log('\n=== sanitizeOrdersData integration cases ===\n');

  // 1. Product mapping exists
  await withMocks(
    { products: [{ productSkuCode: 'C-176112-Blue-40', sellerId: SELLER_A, brand: 'brand' }] },
    async () => {
      const { bulkOps, sellerOrderPayloads } = await sanitizeOrdersData([
        makeCeOrder({
          id: 997,
          lines: [line({ id: 1405, mpn: 'C-176112-Blue-40', qty: 8 })],
        }),
      ]);
      const sku = bulkOps[0]?.updateOne?.update?.$set?.orderSkuList?.skuList?.[0];
      assert(bulkOps.length === 1, 'Case1: bulkOp created when Product maps');
      assert(sku?.merchantProductNo === 'C-176112-Blue-40', 'Case1: skuList preserves MerchantProductNo');
      assert(String(sku?.sellerId) === String(SELLER_A), 'Case1: sellerId from Product map');
      assert(sellerOrderPayloads.length === 1, 'Case1: sellerOrderPayload created');
      assert(
        sellerOrderPayloads[0].orderPayload.orderSkuList.skuList.length === 1,
        'Case1: sellerOrderPayload skuList length 1'
      );
    }
  );

  // 2. Product missing, ExtraData sellerId exists
  await withMocks({ products: [] }, async () => {
    const { bulkOps, sellerOrderPayloads } = await sanitizeOrdersData([
      makeCeOrder({
        id: 998,
        lines: [line({ id: 1406, mpn: '10154815-550-BEIGE-3XL', qty: 6, extraSellerId: SELLER_B })],
      }),
    ]);
    const set = bulkOps[0]?.updateOne?.update?.$set;
    const sku = set?.orderSkuList?.skuList?.[0];
    assert(bulkOps.length === 1, 'Case2: bulkOp created when only ExtraData resolves seller');
    assert(set?.orderSkuList?.skuList?.length === 1, 'Case2: orderSkuList.skuList populated');
    assert(sku?.merchantProductNo === '10154815-550-BEIGE-3XL', 'Case2: line MPN preserved');
    assert(String(sku?.sellerId) === String(SELLER_B), 'Case2: sellerId from ExtraData');
    assert(sku?.quantity === 6, 'Case2: quantity preserved');
    assert(sellerOrderPayloads.length === 1, 'Case2: sellerOrderPayload created');

    // Simulate upsertSellerOrdersFromOrder products build
    const payloadSkuList = sellerOrderPayloads[0].orderPayload.orderSkuList.skuList;
    const products = payloadSkuList.map((s) => ({
      productId: s.id,
      merchantProductNo: s.merchantProductNo,
      quantity: s.quantity,
    }));
    assert(
      products.length === 1 && products[0].merchantProductNo === '10154815-550-BEIGE-3XL',
      'Case2: SellerOrder products would be populated from recovered skuList'
    );
  });

  // 3. Product missing and ExtraData missing → dropped
  await withMocks({ products: [] }, async () => {
    const { bulkOps, sellerOrderPayloads } = await sanitizeOrdersData([
      makeCeOrder({
        id: 999,
        lines: [line({ id: 1407, mpn: 'UNKNOWN-SKU-XYZ', qty: 1 })],
      }),
    ]);
    assert(bulkOps.length === 0, 'Case3: no bulkOp when sellerId unresolvable');
    assert(sellerOrderPayloads.length === 0, 'Case3: no sellerOrderPayload when sellerId unresolvable');
  });

  // 4. Multi-line: some SKUs missing from Product
  // First line has no Product/ExtraData → finalSellerId stays null.
  // Second maps via Product; third via ExtraData only.
  await withMocks({ products: [{ productSkuCode: 'MAPPED-SKU', sellerId: SELLER_A, brand: 'brand' }] }, async () => {
    const { bulkOps, sellerOrderPayloads } = await sanitizeOrdersData([
      makeCeOrder({
        id: 1000,
        lines: [
          line({ id: 1, mpn: 'UNMAPPED-NO-EXTRA', qty: 1 }),
          line({ id: 2, mpn: 'MAPPED-SKU', qty: 2 }),
          line({ id: 3, mpn: 'UNMAPPED-WITH-EXTRA', qty: 3, extraSellerId: SELLER_B }),
        ],
      }),
    ]);
    const skuList = bulkOps[0]?.updateOne?.update?.$set?.orderSkuList?.skuList || [];
    assert(bulkOps.length === 1, 'Case4: order kept when at least one line resolves');
    assert(skuList.length === 2, 'Case4: two resolvable lines kept, one dropped');
    assert(
      !skuList.some((s) => s.merchantProductNo === 'UNMAPPED-NO-EXTRA'),
      'Case4: unmapped SKU without ExtraData dropped when finalSellerId is null'
    );
    assert(
      skuList.some((s) => s.merchantProductNo === 'MAPPED-SKU' && String(s.sellerId) === String(SELLER_A)),
      'Case4: mapped SKU kept with Product seller'
    );
    assert(
      skuList.some((s) => s.merchantProductNo === 'UNMAPPED-WITH-EXTRA' && String(s.sellerId) === String(SELLER_B)),
      'Case4: unmapped SKU kept via ExtraData'
    );
    assert(sellerOrderPayloads.length === 1, 'Case4: sellerOrderPayload created');
    assert(
      sellerOrderPayloads[0].orderPayload.orderSkuList.skuList.length === 2,
      'Case4: sellerOrderPayload has 2 products worth of skus'
    );
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
