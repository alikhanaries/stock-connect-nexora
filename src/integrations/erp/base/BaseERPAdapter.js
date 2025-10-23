export const createBaseERPAdapter = () => ({
  pushOrders: async () => {
    throw new Error('pushOrders() not implemented');
  },
});
