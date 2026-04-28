export const ROLES = {
  SUPERADMIN: 'superadmin',
  TENANT_ADMIN: 'tenant_admin',
  BRANCH_USER: 'branch_user',
  VIEWER: 'viewer',
};

export const COLLECTIONS = {
  USERS: 'users',
  TENANTS: 'tenants',
  PLATFORM: 'platform',
};

export const TENANT_SUBCOLLECTIONS = {
  BRANCHES: 'branches',
  RAFFLES: 'raffles',
  PARTICIPANTS: 'participants',
  CUSTOMERS: 'customers',
  CONFIG: 'config',
  USERS: 'users',
  AUDIT: 'audit',
};

export function isRole(role, expectedRole) {
  return String(role || '') === expectedRole;
}

export function isSuperAdminRole(role) {
  return isRole(role, ROLES.SUPERADMIN);
}

export function isTenantAdminRole(role) {
  return isRole(role, ROLES.TENANT_ADMIN);
}

export function isBranchUserRole(role) {
  return isRole(role, ROLES.BRANCH_USER);
}

export function isViewerRole(role) {
  return isRole(role, ROLES.VIEWER);
}

export function getRoleLabel(role) {
  const labels = {
    [ROLES.SUPERADMIN]: 'Superadministrador',
    [ROLES.TENANT_ADMIN]: 'Administrador',
    [ROLES.BRANCH_USER]: 'Usuario de sucursal',
    [ROLES.VIEWER]: 'Visualizador',
  };

  return labels[role] || 'Usuario';
}
