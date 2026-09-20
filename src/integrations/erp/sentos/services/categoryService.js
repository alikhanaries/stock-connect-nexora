import { sentosFetch } from '../utils/fetch.js';
import { buildCategoryMap } from '../helpers/categoryMapper.js';

export const fetchSentosCategories = async (logContext = 'Product Sync') => {
  const categories = await sentosFetch('categories', { method: 'GET', logContext });
  return buildCategoryMap(Array.isArray(categories) ? categories : []);
};
