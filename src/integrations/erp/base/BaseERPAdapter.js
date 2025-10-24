export const createBaseERPAdapter = () => ({
  connect: async () => {
    throw new Error('connect() not implemented');
  },
  fetchProducts: async () => {
    throw new Error('fetchProducts() not implemented');
  },
});
