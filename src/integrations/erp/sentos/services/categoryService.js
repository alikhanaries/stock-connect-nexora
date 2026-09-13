import { sentosFetch } from '../utils/fetch.js';
import { buildCategoryMap } from '../helpers/categoryMapper.js';

export const fetchSentosCategories = async () => {
  const categories = await sentosFetch('categories', { method: 'GET' });
  return buildCategoryMap(Array.isArray(categories) ? categories : []);
};
