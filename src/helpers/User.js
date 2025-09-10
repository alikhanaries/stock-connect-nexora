const userRoleBasedAccess = (creatorRole, newUserRole) => {
  if (creatorRole === 'seller_admin') {
    return false;
  } else if (creatorRole === 'brand_super_admin' && newUserRole === 'platform_master') {
    return false;
  }
  return true;
};

export default { userRoleBasedAccess };
