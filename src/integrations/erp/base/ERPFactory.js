import { createNebimAdapter } from '../nebim/nebimAdapter.js';
import { nebimConfig as defaultNebimConfig } from '../nebim/config/config.js';

export const createERPAdapter = (type, configOverride = null) => {
  switch (type.toLowerCase()) {
    case 'nebim':
      return createNebimAdapter(configOverride || defaultNebimConfig);

    default:
      throw new Error(`Unknown ERP type: ${type}`);
  }
};
