import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
const BASE_URL = `${entegraConfig?.ENTEGRA_BASE_URL}category/page=`;
const AUTH_TOKEN = `JWT ${entegraConfig?.ENTEGRA_AUTH_TOKEN}`;
import { translateCategoriesBatch } from '#root/src/integrations/erp/entegra/helpers/languageTranslatorHelper.js';
export const fetchCategories = async () => {
  const categories = [];
  let page = 1;

  // FETCH PAGINATED CATEGORIES

  while (true) {
    const url = `${BASE_URL}${page}/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch categories: ${response.status}`);

    const data = await response.json();
    if (!data?.categories?.length) break;
    // Only store id and name
    categories.push(
      ...data.categories.map((c) => ({
        id: c.id,
        name: c.name?.trim(),
      }))
    );
    page++;
  }

  if (!categories.length) return [];

  // MAP categoryId → name

  const categoryIdMap = {};
  categories.forEach((c) => {
    if (c.name?.trim()) categoryIdMap[c.id] = c.name.trim();
  });

  // TRANSLATE UNIQUE NAMES

  const uniqueNames = [...new Set(Object.values(categoryIdMap))];
  const translationMap = await translateCategoriesBatch(uniqueNames);

  // BUILD FINAL RESPONSE

  const result = categories.map((c) => ({
    id: c.id,

    name: translationMap[c.name?.trim()] || c.name?.trim(),
  }));

  return result;
};
