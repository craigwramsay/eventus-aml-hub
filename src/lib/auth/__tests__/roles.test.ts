import { describe, it, expect } from 'vitest';
import {
  ROLES,
  ROLE_LABELS,
  canFinaliseAssessment,
  canCreateAssessment,
  canManageUsers,
  canViewReports,
  type UserRole,
} from '../roles';

describe('RBAC Roles', () => {
  describe('ROLES constant', () => {
    it('defines exactly three roles', () => {
      expect(ROLES).toHaveLength(3);
      expect(ROLES).toContain('solicitor');
      expect(ROLES).toContain('mlro');
      expect(ROLES).toContain('admin');
    });
  });

  describe('ROLE_LABELS', () => {
    it('has human-readable labels for all roles', () => {
      expect(ROLE_LABELS.solicitor).toBe('Solicitor');
      expect(ROLE_LABELS.mlro).toBe('MLRO');
      expect(ROLE_LABELS.admin).toBe('Administrator');
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
  });

  describe('Permission matrix completeness', () => {
    const allRoles: UserRole[] = ['solicitor', 'mlro', 'admin'];
    const allPermissions = [
      canFinaliseAssessment,
      canCreateAssessment,
      canManageUsers,
      canViewReports,
    ];

    it('every role returns a boolean for every permission', () => {
      for (const role of allRoles) {
        for (const permission of allPermissions) {
          expect(typeof permission(role)).toBe('boolean');
        }
      }
    });
  });
});
