import { nebimConfig as defaultConfig } from './config/config.js';
import { connectNebim } from './util/connect.js';

export const createNebimAdapter = (config = defaultConfig) => {
  const cfg = { ...defaultConfig, ...config };

  return {
    connect: async () => {
      try {
        return await connectNebim(cfg);
      } catch (err) {
        console.error('Nebim connect error:', err.message);
        throw err;
      }
    },
  };
};
