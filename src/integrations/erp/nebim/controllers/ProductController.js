import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreNebimProducts } from '../service/productService.js';

export const fetchProducts = async (req, res) => {
  try {
    const { sellerId } = req;
    successResponse(res, 'Nebim product sync started in background', 202);
    process.nextTick(async () => {
      try {
        const { totalInserted, totalUpdated } = await fetchAndStoreNebimProducts(sellerId);
        console.log(`✅ Nebim sync completed: Inserted ${totalInserted}, Updated ${totalUpdated}`);
      } catch (err) {
        console.error('❌ Background sync failed:', err);
      }
    });
  } catch (error) {
    errorResponse(res, error, 500);
  }
};
