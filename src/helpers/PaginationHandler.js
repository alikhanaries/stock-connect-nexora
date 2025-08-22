export const getPagination = (totalElements=0, page = 1, limit = 10) => {
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(limit, 10) || 10);
  const totalPages = Math.ceil(totalElements / size) || 1;
  return {
    totalElements,
    totalPages,
    page: currentPage,
    size,
  };
};
