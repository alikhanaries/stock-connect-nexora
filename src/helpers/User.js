import { ROLES_BASED_USER_CREATION } from '#constants/common.js';

const userRoleBasedAccess = (creatorRole, newUserRole) => {
  return ROLES_BASED_USER_CREATION[creatorRole]?.includes(newUserRole) || false;
};

export default { userRoleBasedAccess };
