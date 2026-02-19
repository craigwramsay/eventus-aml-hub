/**
 * Role-Based Access Control
 *
 * Three roles: solicitor, mlro, admin
 * Permission checks are pure functions — no database access.
 */

export const ROLES = ['solicitor', 'mlro', 'admin'] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  solicitor: 'Solicitor',
  mlro: 'MLRO',
  admin: 'Administrator',
};

export function canFinaliseAssessment(role: UserRole): boolean {
  return role === 'solicitor' || role === 'mlro';
}

export function canCreateAssessment(role: UserRole): boolean {
  return role === 'solicitor' || role === 'mlro';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canViewReports(role: UserRole): boolean {
  return role === 'mlro' || role === 'admin';
}
