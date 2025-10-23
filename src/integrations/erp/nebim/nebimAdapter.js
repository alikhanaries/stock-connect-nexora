import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { connectNebim } from './util/connect.js';

export const createNebimAdapter = () => {
  const base = createBaseERPAdapter();
  return {
    ...base,
    connect: async () => {
      try {
        return await connectNebim();
      } catch (err) {
        console.error('Nebim connect error:', err.message);
        throw err;
      }
    },
  };
};
