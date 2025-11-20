import { createNebimAdapter } from '../nebim/nebimAdapter.js';
import { nebimConfig as defaultNebimConfig } from '../nebim/config/config.js';
import { gurmanConfig as defaultGurmanConfig } from '../gurmenKip/config/config.js';
import { createGurmanAdapter } from '../gurmenKip/gurmanAdapter.js';

export const createERPAdapter = (type, configOverride = null) => {
  switch (type.toLowerCase()) {
    case 'nebim':
      return createNebimAdapter(configOverride || defaultNebimConfig);
    case 'gurman':
      return createGurmanAdapter(configOverride || defaultGurmanConfig);
    default:
      throw new Error(`Unknown ERP type: ${type}`);
  }
};
