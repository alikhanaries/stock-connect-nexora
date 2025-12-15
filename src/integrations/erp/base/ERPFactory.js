import { createNebimAdapter } from '../nebim/nebimAdapter.js';
import { nebimConfig as defaultNebimConfig } from '../nebim/config/config.js';
import { gurmanKipConfig as defaultGurmanKipConfig } from '../gurmenKip/config/config.js';
import { gurmanRamseyConfig as defaultGurmanRamseyConfig } from '../gurmenRamsey/config/config.js';
import { createGurmanKipAdapter } from '../gurmenKip/gurmanAdapter.js';
import { createGurmanRamseyAdapter } from '../gurmenRamsey/ramseyAdapter.js';
import { createOcpAdapter } from '../ocp/ocpAdapter.js';
import { ocpConfig as defualtOcpConfig } from '../ocp/config/config.js';

export const createERPAdapter = (type, configOverride = null) => {
  switch (type.toLowerCase()) {
    case 'nebim':
      return createNebimAdapter(configOverride || defaultNebimConfig);
    case 'gurman_kip':
      return createGurmanKipAdapter(configOverride || defaultGurmanKipConfig);
    case 'gurman_ramsey':
      return createGurmanRamseyAdapter(configOverride || defaultGurmanRamseyConfig);
    case 'ocp':
      return createOcpAdapter(configOverride || defualtOcpConfig);
    default:
      throw new Error(`Unknown ERP type: ${type}`);
  }
};
