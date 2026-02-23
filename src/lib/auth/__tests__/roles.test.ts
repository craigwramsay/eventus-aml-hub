import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  isPlatformAdmin,
  canFinaliseAssessment,
  canCreateAssessment,
  canManageUsers,
  canViewReports,
  canDeleteEntities,
  type UserRole,
} from '../roles';

describe('RBAC Roles', () => {
  describe('ROLES constant', () => {
    it('defines exactly four roles', () => {
      expect(ROLES).toHaveLength(4);
      expect(ROLES).toContain('solicitor');
      expect(ROLES).toContain('mlro');
      expect(ROLES).toContain('admin');
      expect(ROLES).toContain('platform_admin');
    });
  });

  describe('ASSIGNABLE_ROLES', () => {
    it('contains only the three assignable roles (no platform_admin)', () => {
      expect(ASSIGNABLE_ROLES).toHaveLength(3);
      expect(ASSIGNABLE_ROLES).toContain('solicitor');
      expect(ASSIGNABLE_ROLES).toContain('mlro');
      expect(ASSIGNABLE_ROLES).toContain('admin');
      expect(ASSIGNABLE_ROLES).not.toContain('platform_admin');
    });
  });

  describe('ROLE_LABELS', () => {
    it('has human-readable labels for all roles', () => {
      expect(ROLE_LABELS.solicitor).toBe('Solicitor');
      expect(ROLE_LABELS.mlro).toBe('MLRO');
      expect(ROLE_LABELS.admin).toBe('Administrator');
      expect(ROLE_LABELS.platform_admin).toBe('Platform Admin');
    });
  });

  describe('isPlatformAdmin', () => {
    it('returns true for platform_admin', () => {
      expect(isPlatformAdmin('platform_admin')).toBe(true);
    });

    it('returns false for all other roles', () => {
      expect(isPlatformAdmin('solicitor')).toBe(false);
      expect(isPlatformAdmin('mlro')).toBe(false);
      expect(isPlatformAdmin('admin')).toBe(false);
    });
  });

  describe('canFinaliseAssessment', () => {
    it('allows solicitors to finalise', () => {
      expect(canFinaliseAssessment('solicitor')).toBe(true);
    });

    it('allows MLROs to finalise', () => {
      expect(canFinaliseAssessment('mlro')).toBe(true);
    });

    it('allows admins to finalise', () => {
      expect(canFinaliseAssessment('admin')).toBe(true);
    });

    it('allows platform_admin to finalise', () => {
      expect(canFinaliseAssessment('platform_admin')).toBe(true);
    });
  });

  describe('canCreateAssessment', () => {
    it('allows solicitors to create', () => {
      expect(canCreateAssessment('solicitor')).toBe(true);
    });

    it('allows MLROs to create', () => {
      expect(canCreateAssessment('mlro')).toBe(true);
    });

    it('allows admins to create', () => {
      expect(canCreateAssessment('admin')).toBe(true);
    });

    it('allows platform_admin to create', () => {
      expect(canCreateAssessment('platform_admin')).toBe(true);
    });
  });

  describe('canManageUsers', () => {
    it('does not allow solicitors to manage users', () => {
      expect(canManageUsers('solicitor')).toBe(false);
    });

    it('does not allow MLROs to manage users', () => {
      expect(canManageUsers('mlro')).toBe(false);
    });

    it('allows admins to manage users', () => {
      expect(canManageUsers('admin')).toBe(true);
    });

    it('allows platform_admin to manage users', () => {
      expect(canManageUsers('platform_admin')).toBe(true);
    });
  });

  describe('canViewReports', () => {
    it('does not allow solicitors to view reports', () => {
      expect(canViewReports('solicitor')).toBe(false);
    });

    it('allows MLROs to view reports', () => {
      expect(canViewReports('mlro')).toBe(true);
    });

    it('allows admins to view reports', () => {
      expect(canViewReports('admin')).toBe(true);
    });

    it('allows platform_admin to view reports', () => {
      expect(canViewReports('platform_admin')).toBe(true);
    });
  });

  describe('canDeleteEntities', () => {
    it('does not allow solicitors to delete entities', () => {
      expect(canDeleteEntities('solicitor')).toBe(false);
    });

    it('allows MLROs to delete entities', () => {
      expect(canDeleteEntities('mlro')).toBe(true);
    });

    it('does not allow admins to delete entities', () => {
      expect(canDeleteEntities('admin')).toBe(false);
    });

    it('allows platform_admin to delete entities', () => {
      expect(canDeleteEntities('platform_admin')).toBe(true);
    });
  });

  describe('Permission matrix completeness', () => {
    const allRoles: UserRole[] = ['solicitor', 'mlro', 'admin', 'platform_admin'];
    const allPermissions = [
      canFinaliseAssessment,
      canCreateAssessment,
      canManageUsers,
      canViewReports,
      canDeleteEntities,
    ];

    it('every role returns a boolean for every permission', () => {
      for (const role of allRoles) {
        for (const permission of allPermissions) {
          expect(typeof permission(role)).toBe('boolean');
        }
      }
    });

    it('platform_admin has all permissions', () => {
      for (const permission of allPermissions) {
        expect(permission('platform_admin')).toBe(true);
      }
    });
  });
});
