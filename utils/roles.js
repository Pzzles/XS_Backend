/**
 * Role definitions for the XS Enterprise system
 */

// Define role constants
const ROLES = {
  ENTERPRISE_ADMIN: 'enterprise_admin',
  DEPARTMENT_ADMIN: 'department_admin',
  TEAM_LEADER: 'team_leader',
  EMPLOYEE: 'employee'
};

// Define role hierarchy (higher number = higher permissions)
const ROLE_LEVELS = {
  [ROLES.EMPLOYEE]: 1,
  [ROLES.TEAM_LEADER]: 2,
  [ROLES.DEPARTMENT_ADMIN]: 3,
  [ROLES.ENTERPRISE_ADMIN]: 4
};

/**
 * Check if a role exists in our defined roles
 * @param {string} role - Role to check
 * @returns {boolean} - Whether the role is valid
 */
const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

/**
 * Check if user has sufficient permission level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role for action
 * @returns {boolean} - Whether user has sufficient permissions
 */
const hasPermission = (userRole, requiredRole) => {
  if (!isValidRole(userRole) || !isValidRole(requiredRole)) {
    return false;
  }
  
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
};

/**
 * Get all roles at or below a specified level
 * @param {string} maxRole - The maximum role level to include
 * @returns {string[]} - Array of roles at or below the specified level
 */
const getRolesAtOrBelow = (maxRole) => {
  const maxLevel = ROLE_LEVELS[maxRole] || 0;
  return Object.entries(ROLE_LEVELS)
    .filter(([_, level]) => level <= maxLevel)
    .map(([role]) => role);
};

/**
 * Get default role for specific context
 * @param {string} context - Context for role assignment
 * @returns {string} - The default role for that context
 */
const getDefaultRole = (context) => {
  switch (context) {
    case 'enterprise':
      return ROLES.ENTERPRISE_ADMIN;
    case 'department':
      return ROLES.DEPARTMENT_ADMIN;
    case 'team':
      return ROLES.TEAM_LEADER;
    default:
      return ROLES.EMPLOYEE;
  }
};

module.exports = {
  ROLES,
  ROLE_LEVELS,
  isValidRole,
  hasPermission,
  getRolesAtOrBelow,
  getDefaultRole
}; 