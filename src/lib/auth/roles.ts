/**
 * Role-Based Access Control
 *
 * Four roles: solicitor, mlro, admin, platform_admin
 * Permission checks are pure functions — no database access.
 */

export const ROLES = ['solicitor', 'mlro', 'admin', 'platform_admin'] as const;
export type UserRole = (typeof ROLES)[number];

/** Roles that can be assigned via invite / role-change UI (excludes platform_admin) */
export const ASSIGNABLE_ROLES = ['solicitor', 'mlro', 'admin'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  solicitor: 'Solicitor',
  mlro: 'MLRO',
  admin: 'Administrator',
  platform_admin: 'Platform Admin',
};

export function isPlatformAdmin(role: UserRole): boolean {
  return role === 'platform_admin';
}

export function canFinaliseAssessment(role: UserRole): boolean {
  return role === 'solicitor' || role === 'mlro' || role === 'admin' || role === 'platform_admin';
}

export function canCreateAssessment(role: UserRole): boolean {
  return role === 'solicitor' || role === 'mlro' || role === 'admin' || role === 'platform_admin';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin' || role === 'platform_admin';
}

export function canViewReports(role: UserRole): boolean {
  return role === 'mlro' || role === 'admin' || role === 'platform_admin';
}

export function canDeleteEntities(role: UserRole): boolean {
  return role === 'mlro' || role === 'platform_admin';
}

export function canDecideApproval(role: UserRole): boolean {
  return role === 'mlro' || role === 'platform_admin';
}

export function canManageIntegrations(role: UserRole): boolean {
  return role === 'mlro' || role === 'admin' || role === 'platform_admin';
}
