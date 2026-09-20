export const buildCategoryMap = (categories = []) => {
  const map = new Map();

  const walk = (nodes = [], trail = []) => {
    for (const node of nodes) {
      if (!node?.id) continue;
      const path = [...trail, node.name].filter(Boolean).join(' > ');
      map.set(Number(node.id), path);
      if (Array.isArray(node.sub_categories) && node.sub_categories.length) {
        walk(node.sub_categories, [...trail, node.name]);
      }
    }
  };

  walk(categories);
  return map;
};

export const resolveCategoryTrail = (categoryMap, categoryId) => {
  if (!categoryId) return '';
  return categoryMap.get(Number(categoryId)) || '';
};
