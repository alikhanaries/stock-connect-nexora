export const createBaseERPAdapter = () => ({
  connect: async () => {
    throw new Error('connect() not implemented');
  },
});
