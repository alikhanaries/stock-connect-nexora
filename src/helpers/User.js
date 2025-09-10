import { ROLES_BASED_USER_CRETATION } from '#constants/common.js';

const userRoleBasedAccess = (creatorRole, newUserRole) => {
  if (ROLES_BASED_USER_CRETATION[creatorRole]) {
    return ROLES_BASED_USER_CRETATION[creatorRole].includes(newUserRole);
  }
  return false;
};

export default { userRoleBasedAccess };
