import Product from '#models/Product.js';
import '#models/Category.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_KEY, CHANNEL_ENGINE_BATCH_SIZE, CHANNEL_ENGINE_MAX_CONCURRENT } =
  config;
import pLimit from 'p-limit';
import { mapProductToChannelEngine } from '#helpers/productMapper.js';

const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);
const MAX_RETRIES = 3;

const fetchProducts = async (query) => {
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = {};
  const appliedFilters = {};

  // Status filter
  if (status !== undefined) {
    const statusBool = status.toString().toLowerCase() === 'true';
    filter.status = statusBool;
    appliedFilters.status = statusBool;
  }

  // Price filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) ((filter.price.$gte = Number(minPrice)), (appliedFilters.minPrice = Number(minPrice)));
    if (maxPrice) ((filter.price.$lte = Number(maxPrice)), (appliedFilters.maxPrice = Number(maxPrice)));
  }

  // Search filter
  // if (search) filter.$text = { $search: search };
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
  }
  // Sorting
  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  // Fetch total and products in parallel
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select('_id name status productSkuCode price msrp images currentStockCount createdAt categories')
      .populate('categories', '_id name slug')
      .lean(),
  ]);

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

// 🔹 Retry helper with exponential backoff
const withRetry = async (fn, retries = MAX_RETRIES, delay = 1000) => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(`Retrying... (${MAX_RETRIES - retries + 1})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
};

// 🔹 Push a single batch to CE
const pushBatch = async (batch, index) => {
  return withRetry(async () => {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`❌ CE API error (Batch ${index + 1}): ${response.status}`);
    }

    const data = await response.json();
    return (
      data.Content || {
        AcceptedCount: 0,
        RejectedCount: batch.length,
        ProductMessages: [],
      }
    );
  });
};

// 🔹 Fetch products from DB in batches
async function* fetchBatchesFromDB() {
  let skip = 0;
  while (true) {
    const products = await Product.find({ status: true }).skip(skip).limit(BATCH_SIZE).lean();
    if (!products.length) break;
    yield products.map(mapProductToChannelEngine);
    skip += BATCH_SIZE;
  }
}

// 🔹 Push all products to CE
export const pushProductsFromDB = async () => {
  const limit = pLimit(MAX_CONCURRENT);
  const results = [];

  let index = 0;
  for await (const batch of fetchBatchesFromDB()) {
    results.push(
      limit(async () => {
        try {
          return await pushBatch(batch, index);
        } catch (err) {
          console.error(`❌ Batch ${index + 1} failed permanently:`, err);
          return {
            AcceptedCount: 0,
            RejectedCount: batch.length,
            ProductMessages: [],
          };
        }
      })
    );
    index++;
  }

  // Wait for all limited promises to finish
  const settled = await Promise.allSettled(results);

  // 🔹 Merge results
  return settled.reduce(
    (acc, r) => {
      if (r.status === 'fulfilled') {
        acc.AcceptedCount += r.value.AcceptedCount;
        acc.RejectedCount += r.value.RejectedCount;
        acc.ProductMessages.push(...r.value.ProductMessages);
      }
      return acc;
    },
    { AcceptedCount: 0, RejectedCount: 0, ProductMessages: [] }
  );
};

const deleteProduct = async (prId) => {
  try {
    const result = await Product.findByIdAndUpdate(
      prId,
      { isDelete: true },
      { new: true } // return updated doc
    );

    if (!result) {
      return { success: false, message: 'Product not found' };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error('Service error in saveUserChannels:', err);
    return { success: false, message: err.message };
  }
};

export default { fetchProducts, pushProductsFromDB, deleteProduct };
