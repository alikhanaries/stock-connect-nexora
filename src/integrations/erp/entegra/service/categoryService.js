import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
const BASE_URL = `${entegraConfig?.ENTEGRA_BASE_URL}category/page=`;

export const fetchCategories = async (AUTH_TOKEN) => {
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

    if (!response.ok) {
      throw new Error(`Failed to fetch categories: ${response.status}`);
    }

    const data = await response.json();
    if (!data?.categories?.length) break;

    categories.push(
      ...data.categories.map((c) => ({
        id: c.id,
        name: c.name?.trim(),
      }))
    );
    page++;
  }

  return categories;
};
